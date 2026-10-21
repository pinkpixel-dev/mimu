import { strToU8, zipSync, type Zippable } from "fflate";
import { exportManifest, noteFilename, noteToMarkdown, planExport, type Note } from "@mimu/shared";

const ROOT = "mimu-export";

/** One note as a standalone Markdown file. */
export function markdownDownload(note: Note): Response {
  return new Response(noteToMarkdown(note), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${noteFilename(note)}"`,
    },
  });
}

/** The whole library: one folder per category, Unsorted/ for anything not organized yet, and manifest.json. */
export function zipDownload(notes: readonly Note[], now = new Date()): Response {
  const entries = planExport(notes);
  const files: Zippable = {};
  for (const { path, note } of entries) files[`${ROOT}/${path}`] = strToU8(noteToMarkdown(note));
  files[`${ROOT}/manifest.json`] = strToU8(`${JSON.stringify(exportManifest(entries, now.toISOString()), null, 2)}\n`);

  const date = now.toISOString().slice(0, 10);
  return new Response(zipSync(files, { level: 6, mtime: now }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="mimu-export-${date}.zip"`,
    },
  });
}
