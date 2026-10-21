import type { Client, InValue, Row } from "@libsql/client";
import type { CaptureInput, Note, NotePatch, NoteQuery, NoteStatus } from "@mimu/shared";
import { resolveCategory, setTags } from "./taxonomy.ts";

const NOTE_COLUMNS = `
  n.id, n.raw_text, n.title, n.markdown, n.summary, n.status, n.user_edited, n.attempt_count,
  n.error_message, n.model_id, n.created_at, n.updated_at, n.processed_at, n.uncertain,
  c.name AS category, c.slug AS category_slug,
  (SELECT group_concat(tag, ',') FROM note_tags WHERE note_id = n.id) AS tags`;

const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

function jsonList(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToNote(row: Row): Note {
  return {
    id: String(row.id),
    raw_text: String(row.raw_text),
    title: str(row.title),
    markdown: str(row.markdown),
    summary: str(row.summary),
    category: str(row.category),
    category_slug: str(row.category_slug),
    tags: row.tags ? String(row.tags).split(",").sort() : [],
    uncertain: jsonList(row.uncertain),
    status: String(row.status) as NoteStatus,
    user_edited: Number(row.user_edited) === 1,
    attempt_count: Number(row.attempt_count),
    error_message: str(row.error_message),
    model_id: str(row.model_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    processed_at: str(row.processed_at),
  };
}

/** Idempotent on id: a retried upload of the same capture returns the existing note instead of duplicating it. */
export async function createNote(db: Client, input: CaptureInput): Promise<{ note: Note; created: boolean }> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `INSERT INTO notes (id, raw_text, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)
          ON CONFLICT (id) DO NOTHING`,
    args: [input.id, input.raw_text, new Date(input.created_at).toISOString(), now],
  });
  const note = await getNote(db, input.id);
  if (!note) throw new Error(`Note ${input.id} missing after insert`);
  return { note, created: result.rowsAffected === 1 };
}

export async function getNote(db: Client, id: string): Promise<Note | null> {
  const result = await db.execute({
    sql: `SELECT ${NOTE_COLUMNS} FROM notes n LEFT JOIN categories c ON c.id = n.category_id WHERE n.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToNote(row) : null;
}

/** Turn free text into a safe FTS5 query: each word becomes a quoted prefix term, so punctuation can't break MATCH syntax. */
export function toFtsQuery(q: string): string | null {
  const words = q.match(/[\p{L}\p{N}]+/gu);
  if (!words) return null;
  return words
    .slice(0, 8)
    .map((word) => `"${word}"*`)
    .join(" ");
}

export async function listNotes(db: Client, query: NoteQuery): Promise<Note[]> {
  const where: string[] = [];
  const args: InValue[] = [];
  let from = "notes n LEFT JOIN categories c ON c.id = n.category_id";
  let order = "n.created_at DESC, n.id DESC";

  const fts = query.q ? toFtsQuery(query.q) : null;
  if (query.q && !fts) return [];
  if (fts) {
    from = `notes_fts f JOIN notes n ON n.rowid = f.rowid LEFT JOIN categories c ON c.id = n.category_id`;
    where.push("notes_fts MATCH ?");
    args.push(fts);
    order = "f.rank, n.created_at DESC";
  }
  if (query.status === "unsorted") {
    where.push("n.status != 'processed'");
  } else if (query.status) {
    where.push("n.status = ?");
    args.push(query.status);
  }
  if (query.category) {
    where.push("c.slug = ?");
    args.push(query.category);
  }
  if (query.tag) {
    where.push("EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag = ?)");
    args.push(query.tag);
  }
  if (query.from) {
    where.push("n.created_at >= ?");
    args.push(new Date(query.from).toISOString());
  }
  if (query.to) {
    where.push("n.created_at <= ?");
    args.push(new Date(query.to).toISOString());
  }
  if (query.before) {
    where.push("n.created_at < ?");
    args.push(query.before);
  }

  const result = await db.execute({
    sql: `SELECT ${NOTE_COLUMNS} FROM ${from} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY ${order} LIMIT ?`,
    args: [...args, query.limit],
  });
  return result.rows.map(rowToNote);
}

/** Manual edit from the library. Marks the note user-edited so background processing never overwrites it. */
export async function patchNote(db: Client, id: string, patch: NotePatch): Promise<Note | null> {
  const tx = await db.transaction("write");
  try {
    const exists = await tx.execute({ sql: "SELECT 1 FROM notes WHERE id = ?", args: [id] });
    if (exists.rows.length === 0) {
      await tx.rollback();
      return null;
    }
    const sets = ["user_edited = 1", "updated_at = ?"];
    const args: InValue[] = [new Date().toISOString()];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.markdown !== undefined) {
      sets.push("markdown = ?");
      args.push(patch.markdown);
    }
    if (patch.category !== undefined) {
      sets.push("category_id = ?");
      args.push(patch.category === null ? null : await resolveCategory(tx, patch.category));
    }
    await tx.execute({ sql: `UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] });
    if (patch.tags !== undefined) await setTags(tx, id, patch.tags);
    await tx.commit();
  } finally {
    tx.close();
  }
  return getNote(db, id);
}

export async function deleteNote(db: Client, id: string): Promise<boolean> {
  const [, result] = await db.batch(
    [
      { sql: "DELETE FROM note_tags WHERE note_id = ?", args: [id] },
      { sql: "DELETE FROM notes WHERE id = ?", args: [id] },
    ],
    "write",
  );
  return (result?.rowsAffected ?? 0) > 0;
}
