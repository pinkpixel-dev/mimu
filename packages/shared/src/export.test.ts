import { test } from "node:test";
import assert from "node:assert/strict";
import type { Note } from "./note.ts";
import { exportManifest, folderName, noteToMarkdown, planExport } from "./export.ts";

function note(overrides: Partial<Note>): Note {
  return {
    id: "note-1",
    raw_text: "what if a terminal tool found duplicate files",
    title: "Duplicate File Analyzer",
    markdown: "## Concept\n\nFind duplicates by hash.",
    summary: "A duplicate finder.",
    category: "Developer Tools",
    category_slug: "developer-tools",
    tags: ["cli", "files"],
    uncertain: [],
    status: "processed",
    user_edited: false,
    attempt_count: 1,
    error_message: null,
    model_id: "gemma4:e4b",
    created_at: "2026-10-20T15:42:00.000Z",
    updated_at: "2026-10-20T15:45:00.000Z",
    processed_at: "2026-10-20T15:45:00.000Z",
    ...overrides,
  };
}

test("processed notes get frontmatter, the organized body, and the original transcript", () => {
  const md = noteToMarkdown(note({ uncertain: ['say "hi"'] }));
  assert.match(md, /^---\nid: "note-1"\ntitle: "Duplicate File Analyzer"\n/);
  assert.match(md, /tags:\n {2}- "cli"\n {2}- "files"/);
  assert.match(md, /uncertain:\n {2}- "say \\"hi\\""/);
  assert.match(md, /# Duplicate File Analyzer\n\n## Concept\n\nFind duplicates by hash\.\n\n## Original transcript\n\n> what if/);
});

test("unprocessed notes export the raw capture without needing Gemma", () => {
  const md = noteToMarkdown(note({ status: "pending", title: null, markdown: null, category: null, tags: [] }));
  assert.match(md, /title: "what if a terminal tool found duplicate files"/);
  assert.match(md, /category: null\ntags: \[\]\nstatus: "pending"/);
  assert.ok(!md.includes("## Original transcript"));
  assert.ok(md.trimEnd().endsWith("what if a terminal tool found duplicate files"));
});

test("folders keep readable names and strip unsafe characters", () => {
  assert.equal(folderName("Project Ideas"), "Project-Ideas");
  assert.equal(folderName("Notes/../Secrets: v2?"), "NotesSecrets-v2");
  assert.equal(folderName(null), "Unsorted");
  assert.equal(folderName("???"), "Unsorted");
});

test("export paths are unique, including case-only collisions, and pending notes go to Unsorted", () => {
  const entries = planExport([
    note({ id: "a", created_at: "2026-10-20T10:00:00Z" }),
    note({ id: "b", created_at: "2026-10-20T11:00:00Z", title: "duplicate file analyzer" }),
    note({ id: "c", created_at: "2026-10-20T12:00:00Z", status: "pending", title: null }),
  ]);
  assert.deepEqual(
    entries.map((e) => e.path),
    [
      "Developer-Tools/duplicate-file-analyzer.md",
      "Developer-Tools/duplicate-file-analyzer-2.md",
      "Unsorted/what-if-a-terminal-tool-found-duplicate-files.md",
    ],
  );
  const manifest = exportManifest(entries, "2026-10-21T00:00:00Z");
  assert.equal(manifest.count, 3);
  assert.deepEqual(manifest.notes.map((n) => n.id), ["a", "b", "c"]);
});
