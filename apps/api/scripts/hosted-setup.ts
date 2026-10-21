/**
 * One-time setup for running a public Mimu demo that anyone can sign up to. Not needed for a normal install.
 *
 *   pnpm --filter @mimu/api hosted-setup
 *
 * Needs TURSO_PLATFORM_TOKEN in apps/api/.dev.vars (`turso auth api-tokens mint <name>`). It creates the
 * `mimu-accounts` database, mints a group token that opens every demo database, migrates the accounts schema,
 * and saves the settings to .dev.vars. Run `pnpm quickstart` afterwards to deploy them as Worker secrets.
 * Safe to run again: an existing accounts database and group token are reused.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createClient } from "@libsql/client";
import { migrate } from "../src/db/migrations.ts";
import { ACCOUNT_MIGRATIONS } from "../src/hosted/schema.ts";
import { readDevVars, writeDevVars } from "./dev-vars.ts";

const ACCOUNTS_DB = "mimu-accounts";
const vars = await readDevVars();
const token = vars.TURSO_PLATFORM_TOKEN;
if (!token) throw new Error("Add TURSO_PLATFORM_TOKEN to apps/api/.dev.vars first (turso auth api-tokens mint mimu-demo)");

const rl = createInterface({ input: stdin, output: stdout });
const org = vars.TURSO_ORG || (await rl.question("Turso organization slug (see `turso org list`): ")).trim();
const group = vars.TURSO_GROUP || "default";
rl.close();

async function turso(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function accountsDbUrl(): Promise<string> {
  const existing = await turso("GET", `/databases/${ACCOUNTS_DB}`);
  if (existing.ok) {
    console.log(`✓ Reusing the ${ACCOUNTS_DB} database`);
    return `libsql://${((await existing.json()) as { database: { Hostname: string } }).database.Hostname}`;
  }
  const created = await turso("POST", "/databases", { name: ACCOUNTS_DB, group });
  if (!created.ok) throw new Error(`Couldn't create ${ACCOUNTS_DB}: ${created.status} ${await created.text()}`);
  console.log(`✓ Created the ${ACCOUNTS_DB} database in group "${group}"`);
  return `libsql://${((await created.json()) as { database: { Hostname: string } }).database.Hostname}`;
}

async function groupToken(): Promise<string> {
  if (vars.TURSO_GROUP_TOKEN) {
    console.log("✓ Reusing the saved group token");
    return vars.TURSO_GROUP_TOKEN;
  }
  const response = await turso("POST", `/groups/${encodeURIComponent(group)}/auth/tokens?authorization=full-access`);
  if (!response.ok) throw new Error(`Couldn't mint a group token: ${response.status} ${await response.text()}`);
  console.log(`✓ Minted a token for group "${group}"`);
  return ((await response.json()) as { jwt: string }).jwt;
}

const url = await accountsDbUrl();
const authToken = await groupToken();

// A brand-new database can take a moment before it accepts queries.
const db = createClient({ url, authToken });
for (let attempt = 1; ; attempt++) {
  try {
    await migrate(db, ACCOUNT_MIGRATIONS);
    break;
  } catch (error) {
    if (attempt >= 6) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
}
db.close();
console.log("✓ Accounts schema is up to date");

await writeDevVars({
  TURSO_ORG: org,
  TURSO_GROUP: group,
  TURSO_GROUP_TOKEN: authToken,
  MIMU_ACCOUNTS_DB_URL: url,
  MIMU_DEMO_MAX_ACCOUNTS: vars.MIMU_DEMO_MAX_ACCOUNTS || "50",
});
console.log("✓ Saved to apps/api/.dev.vars");
console.log("\nNext: add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .dev.vars if you want GitHub sign-in, then run `pnpm quickstart` to deploy.");
