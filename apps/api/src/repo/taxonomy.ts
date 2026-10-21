import type { Client, Transaction } from "@libsql/client";
import { MAX_TAGS, matchCategory, normalizeTags, slugify } from "@mimu/shared";

type Executor = Pick<Client | Transaction, "execute">;

/**
 * Turn a suggested category name into a category id, reusing a close existing match
 * ("Developer Tool" → "Developer Tools") before creating a new one.
 */
export async function resolveCategory(db: Executor, suggested: string): Promise<string | null> {
  const existing = (await db.execute("SELECT name FROM categories")).rows.map((row) => String(row.name));
  const name = matchCategory(suggested, existing) ?? suggested.trim();
  const slug = slugify(name);
  if (!slug) return null;
  await db.execute({
    sql: "INSERT INTO categories (id, name, slug, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING",
    args: [crypto.randomUUID(), name, slug, new Date().toISOString()],
  });
  const row = (await db.execute({ sql: "SELECT id FROM categories WHERE slug = ?", args: [slug] })).rows[0];
  return row ? String(row.id) : null;
}

/** Replace a note's tags with the normalized set. */
export async function setTags(db: Executor, noteId: string, tags: readonly string[]): Promise<string[]> {
  const slugs = normalizeTags(tags, MAX_TAGS);
  await db.execute({ sql: "DELETE FROM note_tags WHERE note_id = ?", args: [noteId] });
  for (const slug of slugs) {
    await db.execute({ sql: "INSERT INTO tags (slug) VALUES (?) ON CONFLICT DO NOTHING", args: [slug] });
    await db.execute({ sql: "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)", args: [noteId, slug] });
  }
  return slugs;
}

export async function listCategories(db: Executor) {
  const result = await db.execute(`
    SELECT c.name, c.slug, COUNT(n.id) AS count
    FROM categories c LEFT JOIN notes n ON n.category_id = c.id
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE`);
  return result.rows.map((row) => ({ name: String(row.name), slug: String(row.slug), count: Number(row.count) }));
}

export async function listTags(db: Executor) {
  const result = await db.execute(`
    SELECT tag, COUNT(*) AS count FROM note_tags GROUP BY tag ORDER BY count DESC, tag`);
  return result.rows.map((row) => ({ slug: String(row.tag), count: Number(row.count) }));
}
