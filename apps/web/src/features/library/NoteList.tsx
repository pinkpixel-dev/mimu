import type { Note } from "@mimu/shared";
import { fallbackTitle, formatDate } from "../../lib/format.ts";
import { routeHref } from "../../lib/router.ts";

const STATUS_LABEL: Record<Note["status"], string> = {
  pending: "Waiting for Mimu",
  processing: "Sorting…",
  failed: "Couldn't sort",
  processed: "",
};

export function NoteList({ notes, selectedId }: { notes: Note[]; selectedId: string | null }) {
  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <a
            className="note-row"
            href={routeHref({ view: "note", id: note.id })}
            aria-current={note.id === selectedId ? "page" : undefined}
          >
            <span className="note-row__title">{note.title ?? fallbackTitle(note.raw_text)}</span>
            <span className="note-row__preview">{note.summary ?? note.raw_text}</span>
            <span className="note-row__meta">
              <span>{formatDate(note.created_at)}</span>
              {note.category && <span className="note-row__category">{note.category}</span>}
              {note.status !== "processed" && (
                <span className="pill" data-status={note.status}>
                  {STATUS_LABEL[note.status]}
                </span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
