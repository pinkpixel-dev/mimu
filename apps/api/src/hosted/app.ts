import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Client } from "@libsql/client";
import { createApp } from "../app.ts";
import { migrate } from "../db/migrations.ts";
import {
  countAccounts,
  createLoginCode,
  createOAuthState,
  expiredAccounts,
  expiresAt,
  findAccount,
  findAccountByGithub,
  findAccountByKey,
  LOGIN_CODE_TTL_MS,
  insertAccount,
  issueKey,
  linkGithub,
  pruneShortLived,
  redeemLoginCode,
  redeemOAuthState,
  removeAccount,
  touchAccount,
  type Account,
} from "./accounts.ts";
import { fetchGithubUser, githubAuthorizeUrl, type GithubConfig } from "./github.ts";
import type { Provisioner } from "./provisioner.ts";
import { seedNotes } from "./seed.ts";
import { randomSecret, sha256 } from "./tokens.ts";

export interface HostedDeps {
  /** The accounts database (who owns which note database, and their key hashes). */
  accounts: Client;
  provisioner: Provisioner;
  /** Open a note database by URL. The Worker and Node use different libSQL clients. */
  connect: (url: string) => Client;
  /** The instance owner's own key and notes, which keep working exactly as in single-user mode. */
  owner?: { key: string; db: Client };
  github?: GithubConfig;
  maxAccounts: number;
  /** Where the PWA lives, for redirects after GitHub sign-in. Defaults to the request's origin. */
  appUrl?: string;
  /** Path prefix the API is served under ("/api" on the Worker), used to build the OAuth callback URL. */
  apiPrefix?: string;
}

type Resolved = { kind: "owner"; db: Client } | { kind: "account"; db: Client; account: Account };

function bearer(c: Context): string {
  const header = c.req.header("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** A brand-new Turso database can take a moment before it accepts queries, so the first migration retries. */
async function migrateWithRetry(db: Client, attempts = 6): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
}

/**
 * Create an account with its own seeded note database. Returns null when the demo is full.
 * If anything fails after the database exists, the database is deleted again so nothing is left orphaned.
 */
export async function createAccount(
  deps: HostedDeps,
  github?: { id: string; login: string },
): Promise<Account | null> {
  if ((await countAccounts(deps.accounts)) >= deps.maxAccounts) return null;
  const id = crypto.randomUUID();
  const dbName = randomSecret("mimu-demo-", 6);
  const dbUrl = await deps.provisioner.create(dbName);
  try {
    const db = deps.connect(dbUrl);
    await migrateWithRetry(db);
    await seedNotes(db);
    await insertAccount(deps.accounts, { id, db_name: dbName, db_url: dbUrl, github_id: github?.id, github_login: github?.login });
  } catch (error) {
    await deps.provisioner.delete(dbName).catch((cleanup) => console.error("cleanup failed", cleanup));
    throw error;
  }
  return findAccount(deps.accounts, id);
}

export async function deleteAccount(deps: HostedDeps, account: Account): Promise<void> {
  await deps.provisioner.delete(account.db_name);
  await removeAccount(deps.accounts, account.id);
}

/** Delete demo accounts nobody has used in 30 days. Runs from the Worker's daily cron. */
export async function expireAccounts(deps: HostedDeps, now = new Date()): Promise<string[]> {
  const expired = await expiredAccounts(deps.accounts, now);
  const deleted: string[] = [];
  for (const account of expired) {
    try {
      await deleteAccount(deps, account);
      deleted.push(account.id);
    } catch (error) {
      // Leave it for tomorrow's run rather than stopping the whole sweep.
      console.error(`Failed to expire account ${account.id}`, error);
    }
  }
  await pruneShortLived(deps.accounts, now);
  return deleted;
}

/**
 * The hosted demo: sign-up and sign-in routes, then every other request is routed to the caller's own
 * note database and handled by the normal single-user API.
 */
export function createHostedApp(deps: HostedDeps) {
  const app = new Hono();
  const prefix = deps.apiPrefix ?? "";

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["Content-Disposition"],
      maxAge: 86_400,
    }),
  );

  const appUrl = (c: Context) => (deps.appUrl ?? new URL(c.req.url).origin).replace(/\/+$/, "");
  const callbackUrl = (c: Context) => `${new URL(c.req.url).origin}${prefix}/auth/github/callback`;
  const signinRedirect = (c: Context, params: Record<string, string>) =>
    c.redirect(`${appUrl(c)}/#/signin?${new URLSearchParams(params)}`);

  async function resolve(key: string): Promise<Resolved | null> {
    if (!key) return null;
    if (deps.owner && (await sha256(key)) === (await sha256(deps.owner.key))) return { kind: "owner", db: deps.owner.db };
    const account = await findAccountByKey(deps.accounts, key);
    if (!account) return null;
    await touchAccount(deps.accounts, account);
    return { kind: "account", db: deps.connect(account.db_url), account };
  }

  async function requireAccount(c: Context): Promise<Account | Response> {
    const resolved = await resolve(bearer(c));
    if (!resolved) return c.json({ error: "unauthorized" }, 401);
    if (resolved.kind !== "account") return c.json({ error: "not_a_demo_account" }, 404);
    return resolved.account;
  }

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/auth/config", async (c) =>
    c.json({
      hosted: true,
      github: Boolean(deps.github),
      open: (await countAccounts(deps.accounts)) < deps.maxAccounts,
    }),
  );

  app.post("/accounts", async (c) => {
    const account = await createAccount(deps);
    if (!account) return c.json({ error: "demo_full" }, 403);
    return c.json({ key: await issueKey(deps.accounts, account.id) }, 201);
  });

  app.get("/account", async (c) => {
    const account = await requireAccount(c);
    if (account instanceof Response) return account;
    return c.json({ github_login: account.github_login, created_at: account.created_at, expires_at: expiresAt(account) });
  });

  /** A one-time code for signing another device in to this account (shown as a QR code). Expires in 5 minutes. */
  app.post("/account/pair", async (c) => {
    const account = await requireAccount(c);
    if (account instanceof Response) return account;
    return c.json({ code: await createLoginCode(deps.accounts, account.id), expires_in: LOGIN_CODE_TTL_MS / 1000 }, 201);
  });

  app.delete("/account", async (c) => {
    const account = await requireAccount(c);
    if (account instanceof Response) return account;
    await deleteAccount(deps, account);
    return c.body(null, 204);
  });

  app.post("/auth/exchange", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code : "";
    const accountId = code ? await redeemLoginCode(deps.accounts, code) : null;
    if (!accountId) return c.json({ error: "invalid_code" }, 400);
    return c.json({ key: await issueKey(deps.accounts, accountId) });
  });

  app.get("/auth/github/start", async (c) => {
    if (!deps.github) return c.json({ error: "github_disabled" }, 404);
    const state = await createOAuthState(deps.accounts, null);
    return c.redirect(githubAuthorizeUrl(deps.github, callbackUrl(c), state));
  });

  /** Linking starts with a POST (it needs the bearer key), then the browser follows the returned URL. */
  app.post("/auth/github/link", async (c) => {
    if (!deps.github) return c.json({ error: "github_disabled" }, 404);
    const account = await requireAccount(c);
    if (account instanceof Response) return account;
    const state = await createOAuthState(deps.accounts, account.id);
    return c.json({ url: githubAuthorizeUrl(deps.github, callbackUrl(c), state) });
  });

  app.get("/auth/github/callback", async (c) => {
    if (!deps.github) return c.json({ error: "github_disabled" }, 404);
    const state = await redeemOAuthState(deps.accounts, c.req.query("state") ?? "");
    const code = c.req.query("code");
    if (!state || !code) return signinRedirect(c, { error: "expired" });

    let user;
    try {
      user = await fetchGithubUser(deps.github, code, callbackUrl(c));
    } catch (error) {
      console.error(error);
      return signinRedirect(c, { error: "github" });
    }

    if (state.accountId) {
      const linked = await linkGithub(deps.accounts, state.accountId, user.id, user.login);
      return c.redirect(`${appUrl(c)}/#/account?github=${linked ? "linked" : "taken"}`);
    }

    const account = (await findAccountByGithub(deps.accounts, user.id)) ?? (await createAccount(deps, user));
    if (!account) return signinRedirect(c, { error: "full" });
    return signinRedirect(c, { code: await createLoginCode(deps.accounts, account.id) });
  });

  app.all("*", async (c) => {
    const key = bearer(c);
    const resolved = await resolve(key);
    if (!resolved) return c.json({ error: "unauthorized" }, 401);
    return createApp(resolved.db, key).fetch(c.req.raw);
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
