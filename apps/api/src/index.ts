import { createClient } from "@libsql/client/web";
import { createApp } from "./app.ts";
import { createHostedApp, expireAccounts, type HostedDeps } from "./hosted/app.ts";
import { TursoProvisioner } from "./hosted/provisioner.ts";

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  MIMU_ACCESS_KEY: string;
  // Hosted demo only. Leave these unset for a normal single-user install.
  TURSO_PLATFORM_TOKEN?: string;
  TURSO_ORG?: string;
  TURSO_GROUP?: string;
  TURSO_GROUP_TOKEN?: string;
  MIMU_ACCOUNTS_DB_URL?: string;
  MIMU_DEMO_MAX_ACCOUNTS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

const API_PREFIX = "/api";

/** Hosted mode is on only when every piece it needs is configured. */
function hostedDeps(env: Env): HostedDeps | null {
  const { TURSO_PLATFORM_TOKEN, TURSO_ORG, TURSO_GROUP_TOKEN, MIMU_ACCOUNTS_DB_URL } = env;
  if (!TURSO_PLATFORM_TOKEN || !TURSO_ORG || !TURSO_GROUP_TOKEN || !MIMU_ACCOUNTS_DB_URL) return null;
  // One group token opens every database in the group, including the accounts database.
  const connect = (url: string) => createClient({ url, authToken: TURSO_GROUP_TOKEN });
  return {
    accounts: connect(MIMU_ACCOUNTS_DB_URL),
    provisioner: new TursoProvisioner({
      org: TURSO_ORG,
      platformToken: TURSO_PLATFORM_TOKEN,
      group: env.TURSO_GROUP || "default",
    }),
    connect,
    owner: env.MIMU_ACCESS_KEY
      ? { key: env.MIMU_ACCESS_KEY, db: createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }) }
      : undefined,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : undefined,
    maxAccounts: Number(env.MIMU_DEMO_MAX_ACCOUNTS) || 50,
    apiPrefix: API_PREFIX,
  };
}

export default {
  fetch(request, env) {
    // Static assets (the PWA) are served before this runs; only /api/* reaches the Worker (see wrangler.jsonc).
    const url = new URL(request.url);
    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
      return new Response("Not found", { status: 404 });
    }
    url.pathname = url.pathname.slice(API_PREFIX.length) || "/";
    const stripped = new Request(url, request);

    const hosted = hostedDeps(env);
    if (hosted) return createHostedApp(hosted).fetch(stripped);

    // The web client talks to Turso over HTTP, so a client per request is cheap and safe in Workers.
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    return createApp(db, env.MIMU_ACCESS_KEY).fetch(stripped);
  },

  async scheduled(_controller, env, ctx) {
    const hosted = hostedDeps(env);
    if (!hosted) return;
    ctx.waitUntil(
      expireAccounts(hosted).then((deleted) => {
        if (deleted.length) console.log(`Expired ${deleted.length} demo account(s)`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
