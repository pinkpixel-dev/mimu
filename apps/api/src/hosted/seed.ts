import type { Client, InStatement } from "@libsql/client";
import { MAX_TAGS, normalizeTags, slugify } from "@mimu/shared";
import seed from "./seed-notes.json" with { type: "json" };

const PROCESSING_VERSION = 1;

/**
 * Fill a new demo database with already-organized sample notes (real Gemma output, built by
 * `pnpm --filter @pinkpixel/mimu-worker seed:build`), so the library, search, Ask, and export have something
 * to show before the visitor's own desktop worker is running.
 *
 * Everything goes in one batch: on Workers each database call is a subrequest, and those are capped per request.
 */
export async function seedNotes(db: Client, now = new Date()): Promise<void> {
  const statements: InStatement[] = [];
  const categoryIds = new Map<string, string>();
  const tagSlugs = new Set<string>();

  for (const note of seed.notes) {
    const slug = slugify(note.category);
    if (!categoryIds.has(slug)) {
      const id = crypto.randomUUID();
      categoryIds.set(slug, id);
      statements.push({
        sql: "INSERT INTO categories (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
        args: [id, note.category, slug, now.toISOString()],
      });
    }
  }

  for (const note of seed.notes) {
    const id = crypto.randomUUID();
    const created = new Date(now.getTime() - note.hours_ago * 60 * 60 * 1000).toISOString();
    const processed = new Date(Date.parse(created) + 60_000).toISOString();
    statements.push({
      sql: `INSERT INTO notes (
              id, raw_text, title, markdown, summary, category_id, status, uncertain, attempt_count,
              model_id, processing_version, created_at, updated_at, processed_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'processed', ?, 1, ?, ?, ?, ?, ?)`,
      args: [
        id,
        note.raw_text,
        note.title,
        note.markdown,
        note.summary,
        categoryIds.get(slugify(note.category)) ?? null,
        JSON.stringify(note.uncertain),
        seed.model_id,
        PROCESSING_VERSION,
        created,
        processed,
        processed,
      ],
    });
    for (const tag of normalizeTags(note.tags, MAX_TAGS)) {
      if (!tagSlugs.has(tag)) {
        tagSlugs.add(tag);
        statements.push({ sql: "INSERT INTO tags (slug) VALUES (?)", args: [tag] });
      }
      statements.push({ sql: "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)", args: [id, tag] });
    }
  }

  await db.batch(statements, "write");
}
