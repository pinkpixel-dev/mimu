/**
 * Run the API on Node against a local libSQL file instead of Turso Cloud.
 * Same routes and code as the Worker, so you can develop and test end to end without touching real notes.
 *
 *   pnpm --filter @mimu/api dev:local              # http://127.0.0.1:8788, data in apps/api/local.db
 *   MIMU_LOCAL_DB=/tmp/x.db pnpm --filter @mimu/api dev:local
 *   MIMU_LOCAL_HOSTED=1 pnpm --filter @mimu/api dev:local   # hosted demo mode, accounts in apps/api/local-demo/
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { createApp } from "../src/app.ts";
import { migrate } from "../src/db/migrations.ts";
import { createHostedApp } from "../src/hosted/app.ts";
import { LocalProvisioner } from "../src/hosted/local-provisioner.ts";
import { ACCOUNT_MIGRATIONS } from "../src/hosted/schema.ts";
import { readDevVars } from "./dev-vars.ts";

const port = Number(process.env.MIMU_LOCAL_PORT ?? 8788);
const file = process.env.MIMU_LOCAL_DB ?? fileURLToPath(new URL("../local.db", import.meta.url));
const vars = await readDevVars().catch(() => ({}) as Record<string, string>);
const accessKey = process.env.MIMU_ACCESS_KEY ?? vars.MIMU_ACCESS_KEY;
if (!accessKey) throw new Error("Set MIMU_ACCESS_KEY in apps/api/.dev.vars or the environment");

const db = createClient({ url: `file:${file}` });
await migrate(db);

let fetch = createApp(db, accessKey).fetch;
if (process.env.MIMU_LOCAL_HOSTED) {
  const dir = fileURLToPath(new URL("../local-demo/", import.meta.url));
  await mkdir(dir, { recursive: true });
  const accounts = createClient({ url: `file:${dir}accounts.db` });
  await migrate(accounts, ACCOUNT_MIGRATIONS);
  const githubId = process.env.GITHUB_CLIENT_ID ?? vars.GITHUB_CLIENT_ID;
  const githubSecret = process.env.GITHUB_CLIENT_SECRET ?? vars.GITHUB_CLIENT_SECRET;
  fetch = createHostedApp({
    accounts,
    provisioner: new LocalProvisioner(dir),
    connect: (url) => createClient({ url }),
    owner: { key: accessKey, db },
    github: githubId && githubSecret ? { clientId: githubId, clientSecret: githubSecret } : undefined,
    maxAccounts: Number(process.env.MIMU_DEMO_MAX_ACCOUNTS ?? vars.MIMU_DEMO_MAX_ACCOUNTS) || 50,
    appUrl: process.env.MIMU_APP_URL ?? "http://localhost:5173",
  }).fetch;
}

serve({ fetch, port, hostname: "127.0.0.1" }, (info) => {
  const mode = process.env.MIMU_LOCAL_HOSTED ? "hosted demo, accounts in apps/api/local-demo/" : `db: ${file}`;
  console.log(`Local Mimu API on http://127.0.0.1:${info.port} (${mode})`);
});
