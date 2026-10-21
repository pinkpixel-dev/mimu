import type { Note } from "@mimu/shared";
import { fallbackTitle, formatDate, formatDue } from "../../lib/format.ts";
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
              {note.due_date && <DueBadge date={note.due_date} time={note.due_time} />}
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

export function DueBadge({ date, time }: { date: string; time: string | null }) {
  return (
    <span className="due" title="When this note says it's happening">
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="visually-hidden">Due </span>
      {formatDue(date, time)}
    </span>
  );
}
