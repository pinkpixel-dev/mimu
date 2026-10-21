import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { Note } from "@mimu/shared";
import { migrate } from "../db/migrations.ts";
import { ACCOUNT_TTL_MS, createLoginCode, findAccountByKey } from "./accounts.ts";
import { createHostedApp, expireAccounts, type HostedDeps } from "./app.ts";
import { LocalProvisioner } from "./local-provisioner.ts";
import { ACCOUNT_MIGRATIONS } from "./schema.ts";
import seed from "./seed-notes.json" with { type: "json" };

const OWNER_KEY = "owner-key-123";
let dir: string;
let accounts: Client;
let ownerDb: Client;
let deps: HostedDeps;
let app: ReturnType<typeof createHostedApp>;
const clients: Client[] = [];

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "mimu-hosted-"));
  const connect = (url: string) => {
    const client = createClient({ url });
    clients.push(client);
    return client;
  };
  accounts = connect(`file:${join(dir, "accounts.db")}`);
  ownerDb = connect(`file:${join(dir, "owner.db")}`);
  await migrate(accounts, ACCOUNT_MIGRATIONS);
  await migrate(ownerDb);
  deps = {
    accounts,
    provisioner: new LocalProvisioner(dir),
    connect,
    owner: { key: OWNER_KEY, db: ownerDb },
    maxAccounts: 3,
    appUrl: "https://mimu.example",
  };
  app = createHostedApp(deps);
});

after(async () => {
  for (const client of clients) client.close();
  await rm(dir, { recursive: true, force: true });
});

async function call<T = unknown>(method: string, path: string, key: string | null, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function signup(): Promise<string> {
  const res = await call<{ key: string }>("POST", "/accounts", null);
  assert.equal(res.status, 201);
  assert.match(res.body.key, /^mimu_[0-9a-f]{64}$/);
  return res.body.key;
}

describe("hosted demo", () => {
  test("a new account starts with the organized sample notes", async () => {
    const key = await signup();
    const notes = (await call<{ notes: Note[] }>("GET", "/notes", key)).body.notes;
    assert.equal(notes.length, seed.notes.length);
    assert.ok(notes.every((note) => note.status === "processed" && note.title && note.category));
    assert.ok(notes.some((note) => note.uncertain.length > 0), "at least one sample shows a misheard phrase");

    // Search runs through the seeded FTS index.
    const found = (await call<{ notes: Note[] }>("GET", "/notes?q=coffee", key)).body.notes;
    assert.equal(found.length, 1);
  });

  test("accounts can't see each other's notes, and the owner keeps their own database", async () => {
    const alice = await signup();
    const bob = await signup();
    const created = await call<Note>("POST", "/notes", alice, {
      id: "01ALICEONLY0000000000000",
      raw_text: "alice's secret plan",
      created_at: new Date().toISOString(),
    });
    assert.equal(created.status, 201);

    const bobSearch = (await call<{ notes: Note[] }>("GET", "/notes?q=secret", bob)).body.notes;
    assert.equal(bobSearch.length, 0);
    assert.equal((await call("GET", "/notes/01ALICEONLY0000000000000", bob)).status, 404);

    const ownerNotes = (await call<{ notes: Note[] }>("GET", "/notes", OWNER_KEY)).body.notes;
    assert.equal(ownerNotes.length, 0, "the owner's database is not seeded or shared");
    assert.equal((await call("GET", "/account", OWNER_KEY)).status, 404);
  });

  test("unknown keys are rejected", async () => {
    assert.equal((await call("GET", "/notes", null)).status, 401);
    assert.equal((await call("GET", "/notes", "mimu_nope")).status, 401);
    assert.equal((await call("GET", "/notes", "something-else")).status, 401);
  });

  test("sign-up closes at the account cap", async () => {
    // Three accounts exist from the tests above, and the cap is 3.
    const config = await call<{ open: boolean }>("GET", "/auth/config", null);
    assert.equal(config.body.open, false);
    const res = await call<{ error: string }>("POST", "/accounts", null);
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "demo_full");
  });

  test("a login code is single use and opens the same account", async () => {
    const key = await existingKey();
    const account = await findAccountByKey(accounts, key);
    assert.ok(account);
    const code = await createLoginCode(accounts, account.id);

    const first = await call<{ key: string }>("POST", "/auth/exchange", null, { code });
    assert.equal(first.status, 200);
    assert.equal((await findAccountByKey(accounts, first.body.key))?.id, account.id);
    assert.equal((await call("POST", "/auth/exchange", null, { code })).status, 400);
  });

  test("a pairing code signs another device in to the same account, once", async () => {
    const key = await existingKey();
    const pair = await call<{ code: string; expires_in: number }>("POST", "/account/pair", key);
    assert.equal(pair.status, 201);
    assert.equal(pair.body.expires_in, 300);

    const phone = await call<{ key: string }>("POST", "/auth/exchange", null, { code: pair.body.code });
    assert.equal(phone.status, 200);
    assert.notEqual(phone.body.key, key, "the phone gets its own key");
    assert.equal((await findAccountByKey(accounts, phone.body.key))?.id, (await findAccountByKey(accounts, key))?.id);
    assert.equal((await call("POST", "/auth/exchange", null, { code: pair.body.code })).status, 400);

    // The owner's key isn't a demo account, so there's nothing to pair.
    assert.equal((await call("POST", "/account/pair", OWNER_KEY)).status, 404);
  });

  test("deleting an account removes its database and its keys", async () => {
    const key = await existingKey();
    const account = await findAccountByKey(accounts, key);
    assert.ok(account);
    assert.equal((await call("DELETE", "/account", key)).status, 204);
    assert.equal((await call("GET", "/notes", key)).status, 401);
    await assert.rejects(access(join(dir, `${account.db_name}.db`)));
  });

  test("the daily sweep deletes only accounts unused for 30 days", async () => {
    const remaining = (await accounts.execute("SELECT id FROM accounts")).rows.map((row) => String(row.id));
    assert.ok(remaining.length >= 2);
    const [stale, fresh] = remaining;
    const old = new Date(Date.now() - ACCOUNT_TTL_MS - 60_000).toISOString();
    await accounts.execute({ sql: "UPDATE accounts SET last_seen_at = ? WHERE id = ?", args: [old, stale!] });

    const deleted = await expireAccounts(deps);
    assert.deepEqual(deleted, [stale]);
    const left = (await accounts.execute("SELECT id FROM accounts")).rows.map((row) => String(row.id));
    assert.ok(left.includes(fresh!));
    assert.ok(!left.includes(stale!));
  });
});

/** Keys are only returned at sign-up, so tests that need one for an existing account mint one directly. */
async function existingKey(): Promise<string> {
  const id = String((await accounts.execute("SELECT id FROM accounts ORDER BY created_at DESC LIMIT 1")).rows[0]?.id);
  const code = await createLoginCode(accounts, id);
  return (await call<{ key: string }>("POST", "/auth/exchange", null, { code })).body.key;
}
