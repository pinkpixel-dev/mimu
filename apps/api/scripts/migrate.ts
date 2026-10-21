/**
 * Apply schema migrations to the Turso database configured in apps/api/.dev.vars.
 *
 *   pnpm --filter @mimu/api migrate
 */
import { createClient } from "@libsql/client";
import { migrate } from "../src/db/migrations.ts";
import { readDevVars } from "./dev-vars.ts";

const vars = await readDevVars();
const url = vars.TURSO_DATABASE_URL;
if (!url) throw new Error("TURSO_DATABASE_URL is missing from apps/api/.dev.vars");

const db = createClient({ url, authToken: vars.TURSO_AUTH_TOKEN });
const ran = await migrate(db);
console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Database already up to date");

const tables = await db.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name");
console.log(`Schema objects: ${tables.rows.map((row) => row.name).join(", ")}`);
db.close();
