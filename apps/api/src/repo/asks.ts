import type { Client, Row } from "@libsql/client";
import {
  ASK_CLAIM_TTL_MS,
  noteTitle,
  type Ask,
  type AskAnswerInput,
  type AskFailInput,
  type AskInput,
  type AskStatus,
  type ClaimedAsk,
} from "@mimu/shared";

function parseIds(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Resolve cited note ids to titles in one query. Notes deleted since the answer are simply dropped. */
async function withNotes(db: Client, rows: Row[]): Promise<Ask[]> {
  const allIds = [...new Set(rows.flatMap((row) => parseIds(row.note_ids)))];
  const titles = new Map<string, string>();
  if (allIds.length) {
    const result = await db.execute({
      sql: `SELECT id, title, raw_text FROM notes WHERE id IN (${allIds.map(() => "?").join(", ")})`,
      args: allIds,
    });
    for (const row of result.rows) {
      titles.set(String(row.id), noteTitle({ title: row.title === null ? null : String(row.title), raw_text: String(row.raw_text) }));
    }
  }
  return rows.map((row) => ({
    id: String(row.id),
    question: String(row.question),
    status: String(row.status) as AskStatus,
    answer: row.answer === null ? null : String(row.answer),
    notes: parseIds(row.note_ids)
      .filter((id) => titles.has(id))
      .map((id) => ({ id, title: titles.get(id)! })),
    error_message: row.error_message === null ? null : String(row.error_message),
    created_at: String(row.created_at),
    answered_at: row.answered_at === null ? null : String(row.answered_at),
  }));
}

/** Idempotent on the client-generated id, like captures. */
export async function createAsk(db: Client, input: AskInput): Promise<{ ask: Ask; created: boolean }> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `INSERT INTO asks (id, question, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    args: [input.id, input.question, now, now],
  });
  const ask = await getAsk(db, input.id);
  if (!ask) throw new Error(`Ask ${input.id} missing after insert`);
  return { ask, created: result.rowsAffected === 1 };
}

export async function getAsk(db: Client, id: string): Promise<Ask | null> {
  const result = await db.execute({ sql: "SELECT * FROM asks WHERE id = ?", args: [id] });
  return result.rows[0] ? ((await withNotes(db, result.rows))[0] ?? null) : null;
}

export async function listAsks(db: Client, limit: number): Promise<Ask[]> {
  const result = await db.execute({ sql: "SELECT * FROM asks ORDER BY created_at DESC LIMIT ?", args: [limit] });
  return withNotes(db, result.rows);
}

/** Claim the oldest waiting question (or one whose worker went quiet). */
export async function claimAsk(db: Client, now = new Date()): Promise<ClaimedAsk | null> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - ASK_CLAIM_TTL_MS).toISOString();
  const result = await db.execute({
    sql: `UPDATE asks SET status = 'answering', claim_token = lower(hex(randomblob(16))), claimed_at = ?, updated_at = ?
          WHERE id = (
            SELECT id FROM asks
            WHERE status = 'pending' OR (status = 'answering' AND claimed_at < ?)
            ORDER BY created_at LIMIT 1
          )
          RETURNING id, question, claim_token, created_at`,
    args: [nowIso, nowIso, staleBefore],
  });
  const row = result.rows[0];
  return row
    ? { id: String(row.id), question: String(row.question), claim_token: String(row.claim_token), created_at: String(row.created_at) }
    : null;
}

export async function answerAsk(db: Client, id: string, input: AskAnswerInput): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE asks SET status = 'answered', answer = ?, note_ids = ?, error_message = NULL,
            claim_token = NULL, claimed_at = NULL, answered_at = ?, updated_at = ?
          WHERE id = ? AND status = 'answering' AND claim_token = ?`,
    args: [input.answer, JSON.stringify([...new Set(input.note_ids)]), now, now, id, input.claim_token],
  });
  return result.rowsAffected === 1;
}

export async function failAsk(db: Client, id: string, input: AskFailInput): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE asks SET status = 'failed', error_message = ?, claim_token = NULL, claimed_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'answering' AND claim_token = ?`,
    args: [input.error, new Date().toISOString(), id, input.claim_token],
  });
  return result.rowsAffected === 1;
}
