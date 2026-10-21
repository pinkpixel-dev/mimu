import type { Client, Row } from "@libsql/client";
import type { Digest, DigestInput } from "@mimu/shared";

function rowToDigest(row: Row): Digest {
  let noteIds: string[] = [];
  try {
    noteIds = (JSON.parse(String(row.note_ids)) as unknown[]).map(String);
  } catch {
    // A corrupt list just means no links.
  }
  return {
    date: String(row.date),
    tz: String(row.tz),
    summary: String(row.summary),
    note_ids: noteIds,
    created_at: String(row.created_at),
  };
}

/** Save a day's digest. Writing the same day again replaces it, so a rerun after a crash is harmless. */
export async function saveDigest(db: Client, input: DigestInput, now = new Date()): Promise<Digest> {
  await db.execute({
    sql: `INSERT INTO digests (date, tz, summary, note_ids, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (date) DO UPDATE SET tz = excluded.tz, summary = excluded.summary,
            note_ids = excluded.note_ids, created_at = excluded.created_at`,
    args: [input.date, input.tz, input.summary, JSON.stringify(input.note_ids), now.toISOString()],
  });
  return { ...input, created_at: now.toISOString() };
}

export async function latestDigest(db: Client): Promise<Digest | null> {
  const row = (await db.execute("SELECT * FROM digests ORDER BY date DESC LIMIT 1")).rows[0];
  return row ? rowToDigest(row) : null;
}
