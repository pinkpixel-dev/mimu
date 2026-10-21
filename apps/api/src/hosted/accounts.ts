import type { Client, Row } from "@libsql/client";
import { randomSecret, sha256 } from "./tokens.ts";

export interface Account {
  id: string;
  db_name: string;
  db_url: string;
  github_id: string | null;
  github_login: string | null;
  created_at: string;
  last_seen_at: string;
}

/** Demo accounts are deleted after this long without any request. */
export const ACCOUNT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** `last_seen_at` is refreshed at most this often, so every API call doesn't write to the accounts database. */
const SEEN_RESOLUTION_MS = 60 * 60 * 1000;
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const KEY_PREFIX = "mimu_";

function rowToAccount(row: Row): Account {
  return {
    id: String(row.id),
    db_name: String(row.db_name),
    db_url: String(row.db_url),
    github_id: row.github_id === null ? null : String(row.github_id),
    github_login: row.github_login === null ? null : String(row.github_login),
    created_at: String(row.created_at),
    last_seen_at: String(row.last_seen_at),
  };
}

export async function countAccounts(db: Client): Promise<number> {
  return Number((await db.execute("SELECT COUNT(*) AS count FROM accounts")).rows[0]?.count ?? 0);
}

export async function insertAccount(
  db: Client,
  account: { id: string; db_name: string; db_url: string; github_id?: string; github_login?: string },
  now = new Date(),
): Promise<void> {
  const iso = now.toISOString();
  await db.execute({
    sql: `INSERT INTO accounts (id, db_name, db_url, github_id, github_login, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [account.id, account.db_name, account.db_url, account.github_id ?? null, account.github_login ?? null, iso, iso],
  });
}

/** Mint a new access key for an account. Returns the key itself; only its hash is stored. */
export async function issueKey(db: Client, accountId: string, now = new Date()): Promise<string> {
  const key = randomSecret(KEY_PREFIX);
  await db.execute({
    sql: "INSERT INTO account_keys (key_hash, account_id, created_at) VALUES (?, ?, ?)",
    args: [await sha256(key), accountId, now.toISOString()],
  });
  return key;
}

export async function findAccountByKey(db: Client, key: string): Promise<Account | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const result = await db.execute({
    sql: `SELECT a.* FROM account_keys k JOIN accounts a ON a.id = k.account_id WHERE k.key_hash = ?`,
    args: [await sha256(key)],
  });
  return result.rows[0] ? rowToAccount(result.rows[0]) : null;
}

export async function findAccountByGithub(db: Client, githubId: string): Promise<Account | null> {
  const result = await db.execute({ sql: "SELECT * FROM accounts WHERE github_id = ?", args: [githubId] });
  return result.rows[0] ? rowToAccount(result.rows[0]) : null;
}

/** Push back the expiry clock. Skips the write when the account was already seen within the last hour. */
export async function touchAccount(db: Client, account: Account, now = new Date()): Promise<void> {
  if (now.getTime() - Date.parse(account.last_seen_at) < SEEN_RESOLUTION_MS) return;
  await db.execute({
    sql: "UPDATE accounts SET last_seen_at = ? WHERE id = ?",
    args: [now.toISOString(), account.id],
  });
}

/** Attach a GitHub identity. Returns false if that GitHub account already belongs to a different Mimu account. */
export async function linkGithub(db: Client, accountId: string, githubId: string, login: string): Promise<boolean> {
  const owner = await findAccountByGithub(db, githubId);
  if (owner && owner.id !== accountId) return false;
  await db.execute({
    sql: "UPDATE accounts SET github_id = ?, github_login = ? WHERE id = ?",
    args: [githubId, login, accountId],
  });
  return true;
}

export async function createLoginCode(db: Client, accountId: string, now = new Date()): Promise<string> {
  const code = randomSecret("", 24);
  await db.execute({
    sql: "INSERT INTO login_codes (code_hash, account_id, expires_at) VALUES (?, ?, ?)",
    args: [await sha256(code), accountId, new Date(now.getTime() + LOGIN_CODE_TTL_MS).toISOString()],
  });
  return code;
}

/** Use up a login code. Returns the account id, or null if the code is unknown, used, or expired. */
export async function redeemLoginCode(db: Client, code: string, now = new Date()): Promise<string | null> {
  const result = await db.execute({
    sql: "DELETE FROM login_codes WHERE code_hash = ? RETURNING account_id, expires_at",
    args: [await sha256(code)],
  });
  const row = result.rows[0];
  if (!row || String(row.expires_at) < now.toISOString()) return null;
  return String(row.account_id);
}

export async function createOAuthState(db: Client, accountId: string | null, now = new Date()): Promise<string> {
  const state = randomSecret("", 24);
  await db.execute({
    sql: "INSERT INTO oauth_states (state_hash, account_id, expires_at) VALUES (?, ?, ?)",
    args: [await sha256(state), accountId, new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString()],
  });
  return state;
}

/**
 * Use up an OAuth state. Returns `{ accountId }` (null for a plain sign-in), or null if the state is unknown,
 * used, or expired.
 */
export async function redeemOAuthState(
  db: Client,
  state: string,
  now = new Date(),
): Promise<{ accountId: string | null } | null> {
  const result = await db.execute({
    sql: "DELETE FROM oauth_states WHERE state_hash = ? RETURNING account_id, expires_at",
    args: [await sha256(state)],
  });
  const row = result.rows[0];
  if (!row || String(row.expires_at) < now.toISOString()) return null;
  return { accountId: row.account_id === null ? null : String(row.account_id) };
}

export async function findAccount(db: Client, id: string): Promise<Account | null> {
  const result = await db.execute({ sql: "SELECT * FROM accounts WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToAccount(result.rows[0]) : null;
}

export async function expiredAccounts(db: Client, now = new Date()): Promise<Account[]> {
  const result = await db.execute({
    sql: "SELECT * FROM accounts WHERE last_seen_at < ?",
    args: [new Date(now.getTime() - ACCOUNT_TTL_MS).toISOString()],
  });
  return result.rows.map(rowToAccount);
}

/** Remove an account and everything that points at it. Deletes children explicitly rather than trusting FK cascades. */
export async function removeAccount(db: Client, accountId: string): Promise<void> {
  await db.batch(
    [
      { sql: "DELETE FROM account_keys WHERE account_id = ?", args: [accountId] },
      { sql: "DELETE FROM login_codes WHERE account_id = ?", args: [accountId] },
      { sql: "DELETE FROM oauth_states WHERE account_id = ?", args: [accountId] },
      { sql: "DELETE FROM accounts WHERE id = ?", args: [accountId] },
    ],
    "write",
  );
}

/** Drop login codes and OAuth states nobody came back for. */
export async function pruneShortLived(db: Client, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.batch(
    [
      { sql: "DELETE FROM login_codes WHERE expires_at < ?", args: [iso] },
      { sql: "DELETE FROM oauth_states WHERE expires_at < ?", args: [iso] },
    ],
    "write",
  );
}

export function expiresAt(account: Account): string {
  return new Date(Date.parse(account.last_seen_at) + ACCOUNT_TTL_MS).toISOString();
}
