/**
 * Apply schema migrations to the Turso database configured in apps/api/.dev.vars.
 * On a hosted demo, also migrates the accounts database and every demo account's own database.
 *
 *   pnpm --filter @mimu/api migrate
 */
import { createClient } from "@libsql/client";
import { migrate } from "../src/db/migrations.ts";
import { ACCOUNT_MIGRATIONS } from "../src/hosted/schema.ts";
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

if (vars.MIMU_ACCOUNTS_DB_URL && vars.TURSO_GROUP_TOKEN) {
  const accounts = createClient({ url: vars.MIMU_ACCOUNTS_DB_URL, authToken: vars.TURSO_GROUP_TOKEN });
  const accountRan = await migrate(accounts, ACCOUNT_MIGRATIONS);
  console.log(accountRan.length ? `Accounts database: applied ${accountRan.join(", ")}` : "Accounts database already up to date");

  const rows = (await accounts.execute("SELECT db_name, db_url FROM accounts ORDER BY created_at")).rows;
  accounts.close();
  let updated = 0;
  for (const row of rows) {
    const accountDb = createClient({ url: String(row.db_url), authToken: vars.TURSO_GROUP_TOKEN });
    try {
      if ((await migrate(accountDb)).length) updated++;
    } catch (error) {
      console.error(`  ${row.db_name}: ${error instanceof Error ? error.message : error}`);
    } finally {
      accountDb.close();
    }
  }
  console.log(`Demo accounts: ${rows.length} checked, ${updated} migrated`);
}
