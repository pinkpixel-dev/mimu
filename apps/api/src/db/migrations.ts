import type { Client } from "@libsql/client";

/**
 * Ordered schema migrations. Each one runs once, inside a single batch, and is recorded in schema_migrations.
 * Never edit a migration that has shipped; add a new one.
 */
export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        raw_text TEXT NOT NULL,
        title TEXT,
        markdown TEXT,
        summary TEXT,
        category_id TEXT REFERENCES categories(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
        user_edited INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        claim_token TEXT,
        claimed_at TEXT,
        model_id TEXT,
        processing_version INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        processed_at TEXT
      )`,
      `CREATE INDEX notes_status_created_idx ON notes (status, created_at)`,
      `CREATE INDEX notes_category_idx ON notes (category_id)`,
      `CREATE INDEX notes_created_idx ON notes (created_at)`,
      `CREATE TABLE tags (slug TEXT PRIMARY KEY)`,
      `CREATE TABLE note_tags (
        note_id TEXT NOT NULL REFERENCES notes(id),
        tag TEXT NOT NULL REFERENCES tags(slug),
        PRIMARY KEY (note_id, tag)
      )`,
      `CREATE INDEX note_tags_tag_idx ON note_tags (tag)`,
      `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      // External-content FTS5 index over notes, kept in sync by triggers.
      `CREATE VIRTUAL TABLE notes_fts USING fts5(
        title, markdown, raw_text,
        content='notes', content_rowid='rowid', tokenize='porter unicode61'
      )`,
      `CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts (rowid, title, markdown, raw_text) VALUES (new.rowid, new.title, new.markdown, new.raw_text);
      END`,
      `CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts (notes_fts, rowid, title, markdown, raw_text) VALUES ('delete', old.rowid, old.title, old.markdown, old.raw_text);
      END`,
      `CREATE TRIGGER notes_fts_update AFTER UPDATE OF title, markdown, raw_text ON notes BEGIN
        INSERT INTO notes_fts (notes_fts, rowid, title, markdown, raw_text) VALUES ('delete', old.rowid, old.title, old.markdown, old.raw_text);
        INSERT INTO notes_fts (rowid, title, markdown, raw_text) VALUES (new.rowid, new.title, new.markdown, new.raw_text);
      END`,
    ],
  },
  {
    version: 2,
    name: "uncertain phrases",
    // JSON array of phrases Gemma couldn't make sense of (likely misheard), shown next to the transcript.
    statements: [`ALTER TABLE notes ADD COLUMN uncertain TEXT NOT NULL DEFAULT '[]'`],
  },
  {
    version: 3,
    name: "ask mimu",
    statements: [
      `CREATE TABLE asks (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answering', 'answered', 'failed')),
        answer TEXT,
        note_ids TEXT NOT NULL DEFAULT '[]',
        error_message TEXT,
        claim_token TEXT,
        claimed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        answered_at TEXT
      )`,
      `CREATE INDEX asks_status_created_idx ON asks (status, created_at)`,
    ],
  },
];

export async function migrate(db: Client, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`,
  );
  const applied = new Set(
    (await db.execute("SELECT version FROM schema_migrations")).rows.map((row) => Number(row.version)),
  );
  const ran: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await db.batch(
      [
        ...migration.statements,
        {
          sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
          args: [migration.version, migration.name, new Date().toISOString()],
        },
      ],
      "write",
    );
    ran.push(migration.version);
  }
  return ran;
}
