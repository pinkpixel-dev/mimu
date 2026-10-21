import type { Client } from "@libsql/client";
import { CLAIM_TTL_MS, MAX_ATTEMPTS, RETRY_BACKOFF_MS, type ClaimedNote, type CompleteInput, type FailInput, type WorkerStatus } from "@mimu/shared";
import { resolveCategory, setTags } from "./taxonomy.ts";

/**
 * Atomically move up to `limit` notes into `processing`, each with its own claim token.
 * Picks pending notes, failed notes that still have attempts left, and claims that went stale.
 * User-edited notes are never claimed.
 */
export async function claimNotes(db: Client, limit: number, now = new Date()): Promise<ClaimedNote[]> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const retryBefore = new Date(now.getTime() - RETRY_BACKOFF_MS).toISOString();
  const result = await db.execute({
    sql: `UPDATE notes
          SET status = 'processing', claim_token = lower(hex(randomblob(16))), claimed_at = ?, updated_at = ?
          WHERE id IN (
            SELECT id FROM notes
            WHERE user_edited = 0 AND (
              status = 'pending'
              OR (status = 'failed' AND attempt_count < ? AND updated_at < ?)
              OR (status = 'processing' AND claimed_at < ?)
            )
            ORDER BY created_at
            LIMIT ?
          )
          RETURNING id, raw_text, claim_token`,
    args: [nowIso, nowIso, MAX_ATTEMPTS, retryBefore, staleBefore, limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    raw_text: String(row.raw_text),
    claim_token: String(row.claim_token),
  }));
}

export type CompleteOutcome = "completed" | "not_found" | "stale_claim";

/** Write Gemma's result. Only succeeds if this worker still holds the claim and nobody edited the note meanwhile. */
export async function completeNote(db: Client, id: string, input: CompleteInput): Promise<CompleteOutcome> {
  const tx = await db.transaction("write");
  try {
    const row = (
      await tx.execute({ sql: "SELECT status, claim_token, user_edited FROM notes WHERE id = ?", args: [id] })
    ).rows[0];
    if (!row) {
      await tx.rollback();
      return "not_found";
    }
    if (row.status !== "processing" || row.claim_token !== input.claim_token || Number(row.user_edited) === 1) {
      await tx.rollback();
      return "stale_claim";
    }
    const categoryId = await resolveCategory(tx, input.category);
    await setTags(tx, id, input.tags);
    const now = new Date().toISOString();
    await tx.execute({
      sql: `UPDATE notes SET
              title = ?, markdown = ?, summary = ?, category_id = ?, status = 'processed',
              attempt_count = attempt_count + 1, error_message = NULL, claim_token = NULL, claimed_at = NULL,
              model_id = ?, processing_version = ?, processed_at = ?, updated_at = ?
            WHERE id = ?`,
      args: [input.title, input.markdown, input.summary, categoryId, input.model_id, input.processing_version, now, now, id],
    });
    await tx.commit();
    return "completed";
  } finally {
    tx.close();
  }
}

export async function failNote(db: Client, id: string, input: FailInput): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE notes SET
            status = 'failed', attempt_count = attempt_count + 1, error_message = ?,
            claim_token = NULL, claimed_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'processing' AND claim_token = ?`,
    args: [input.error, new Date().toISOString(), id, input.claim_token],
  });
  return result.rowsAffected === 1;
}

export async function requestOrganize(db: Client): Promise<string> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('organize_requested_at', ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    args: [now],
  });
  return now;
}

export async function workerStatus(db: Client): Promise<WorkerStatus> {
  const [setting, pending] = await db.batch(
    [
      "SELECT value FROM settings WHERE key = 'organize_requested_at'",
      {
        sql: "SELECT COUNT(*) AS count FROM notes WHERE user_edited = 0 AND (status = 'pending' OR (status = 'failed' AND attempt_count < ?))",
        args: [MAX_ATTEMPTS],
      },
    ],
    "read",
  );
  const requested = setting?.rows[0]?.value;
  return {
    organize_requested_at: requested === undefined || requested === null ? null : String(requested),
    pending: Number(pending?.rows[0]?.count ?? 0),
  };
}
