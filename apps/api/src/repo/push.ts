import type { Client } from "@libsql/client";

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(db: Client, subscription: StoredSubscription, now = new Date()): Promise<void> {
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, now.toISOString()],
  });
}

export async function deleteSubscription(db: Client, endpoint: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [endpoint] });
}

export async function listSubscriptions(db: Client): Promise<StoredSubscription[]> {
  const result = await db.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions");
  return result.rows.map((row) => ({
    endpoint: String(row.endpoint),
    keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
  }));
}

export interface ReminderCandidate {
  id: string;
  title: string;
  due_date: string;
  due_time: string;
  tz: string | null;
}

/**
 * Notes with a due time that haven't been reminded yet, on days close enough to now to matter.
 * The exact "is it time yet" check happens in code, because each note has its own timezone.
 */
export async function reminderCandidates(db: Client, days: string[]): Promise<ReminderCandidate[]> {
  const result = await db.execute({
    sql: `SELECT id, COALESCE(title, raw_text) AS title, due_date, due_time, tz FROM notes
          WHERE due_time IS NOT NULL AND reminded_at IS NULL AND due_date IN (${days.map(() => "?").join(", ")})`,
    args: days,
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    due_date: String(row.due_date),
    due_time: String(row.due_time),
    tz: row.tz === null ? null : String(row.tz),
  }));
}

export async function markReminded(db: Client, id: string, now = new Date()): Promise<void> {
  await db.execute({ sql: "UPDATE notes SET reminded_at = ? WHERE id = ?", args: [now.toISOString(), id] });
}
