import type { Migration } from "../db/migrations.ts";

/**
 * Schema for the hosted demo's accounts database. Each account's notes live in its own database (named in
 * `accounts.db_name`); this one only knows who owns which database and which keys open it.
 */
export const ACCOUNT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "accounts",
    statements: [
      `CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        db_name TEXT NOT NULL UNIQUE,
        db_url TEXT NOT NULL,
        github_id TEXT UNIQUE,
        github_login TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )`,
      `CREATE INDEX accounts_last_seen_idx ON accounts (last_seen_at)`,
      // Keys are random 256-bit strings, so a plain SHA-256 is enough; only the hash is stored.
      `CREATE TABLE account_keys (
        key_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX account_keys_account_idx ON account_keys (account_id)`,
      // One-time codes handed to the browser after GitHub sign-in, swapped for a key by POST /auth/exchange.
      `CREATE TABLE login_codes (
        code_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      )`,
      // OAuth `state` values. account_id is set when an existing account is linking GitHub, null for a plain sign-in.
      `CREATE TABLE oauth_states (
        state_hash TEXT PRIMARY KEY,
        account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "push",
    // Set when any device on the account turns on notifications, so the reminder cron only opens those databases.
    statements: [`ALTER TABLE accounts ADD COLUMN push_enabled INTEGER NOT NULL DEFAULT 0`],
  },
];
