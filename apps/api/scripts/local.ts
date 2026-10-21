/**
 * Run the API on Node against a local libSQL file instead of Turso Cloud.
 * Same routes and code as the Worker, so you can develop and test end to end without touching real notes.
 *
 *   pnpm --filter @mimu/api dev:local              # http://127.0.0.1:8788, data in apps/api/local.db
 *   MIMU_LOCAL_DB=/tmp/x.db pnpm --filter @mimu/api dev:local
 */
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { createApp } from "../src/app.ts";
import { migrate } from "../src/db/migrations.ts";
import { readDevVars } from "./dev-vars.ts";

const port = Number(process.env.MIMU_LOCAL_PORT ?? 8788);
const file = process.env.MIMU_LOCAL_DB ?? fileURLToPath(new URL("../local.db", import.meta.url));
const accessKey = process.env.MIMU_ACCESS_KEY ?? (await readDevVars()).MIMU_ACCESS_KEY;
if (!accessKey) throw new Error("Set MIMU_ACCESS_KEY in apps/api/.dev.vars or the environment");

const db = createClient({ url: `file:${file}` });
await migrate(db);

serve({ fetch: createApp(db, accessKey).fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`Local Mimu API on http://127.0.0.1:${info.port} (db: ${file})`);
});
