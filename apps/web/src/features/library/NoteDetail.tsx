import { useEffect, useState } from "react";
import type { Note, NotePatch } from "@mimu/shared";
import type { ApiClient, Category } from "../../lib/api/client.ts";
import { fallbackTitle, formatDate } from "../../lib/format.ts";
import { EmptyState } from "./EmptyState.tsx";
import { ExportButton } from "./ExportButton.tsx";
import { Markdown } from "./Markdown.tsx";
import { NoteEditor } from "./NoteEditor.tsx";

interface Props {
  api: ApiClient;
  id: string;
  categories: Category[];
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

type Load = { status: "loading" } | { status: "ready"; note: Note } | { status: "error"; message: string };

export function NoteDetail({ api, id, categories, onBack, onChanged, onDeleted }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    setMode("view");
    api.getNote(id).then(
      (note) => !cancelled && setLoad({ status: "ready", note }),
      (error: unknown) => !cancelled && setLoad({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  if (load.status === "loading") return <div className="detail detail--loading" aria-busy="true" />;
  if (load.status === "error") {
    return (
      <div className="detail">
        <BackButton onBack={onBack} />
        <EmptyState pose="searching" text={load.message === "not_found" ? "That note is gone." : "Couldn't load this note."} />
      </div>
    );
  }

  const { note } = load;

  async function save(patch: NotePatch) {
    const updated = await api.patchNote(note.id, patch);
    setLoad({ status: "ready", note: updated });
    setMode("view");
    onChanged();
  }

  async function remove() {
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteNote(note.id);
      onDeleted();
    } catch (error) {
      setActionError(`Couldn't delete: ${error instanceof Error ? error.message : error}`);
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <div className="detail">
        <NoteEditor note={note} categories={categories} onSave={save} onCancel={() => setMode("view")} />
      </div>
    );
  }

  return (
    <article className="detail">
      <BackButton onBack={onBack} />
      <header className="detail__header">
        <h1 className="detail__title">{note.title ?? fallbackTitle(note.raw_text)}</h1>
        <p className="detail__meta">
          <span>{formatDate(note.created_at)}</span>
          {note.category && <span className="note-row__category">{note.category}</span>}
          {note.user_edited && <span className="detail__edited">Edited</span>}
        </p>
        {note.tags.length > 0 && (
          <ul className="tag-list" aria-label="Tags">
            {note.tags.map((tag) => (
              <li key={tag} className="tag">
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      {note.status === "processed" && note.markdown ? (
        <Markdown source={note.markdown} />
      ) : (
        <div className="detail__unsorted">
          <p className="detail__raw">{note.raw_text}</p>
          <p className="detail__hint">
            {note.status === "failed"
              ? `Mimu couldn't sort this one${note.error_message ? `: ${note.error_message}` : "."} It'll try again later.`
              : "Mimu will sort this the next time your desktop is on."}
          </p>
        </div>
      )}

      {note.uncertain.length > 0 && (
        <section className="uncertain" aria-label="Unclear phrases">
          <p className="uncertain__title">Mimu wasn't sure about</p>
          <ul>
            {note.uncertain.map((phrase) => (
              <li key={phrase}>“{phrase}”</li>
            ))}
          </ul>
        </section>
      )}

      {note.status === "processed" && (
        <details className="transcript">
          <summary>Original transcript</summary>
          <p>{note.raw_text}</p>
        </details>
      )}

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      <footer className="detail__actions">
        {mode === "confirm-delete" ? (
          <>
            <span className="detail__confirm">Delete this note?</span>
            <button type="button" className="button button--ghost" onClick={() => setMode("view")} disabled={busy}>
              Keep
            </button>
            <button type="button" className="button button--danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button button--ghost" onClick={() => setMode("confirm-delete")}>
              Delete
            </button>
            <ExportButton label="Export" title="Download this note as Markdown" run={() => api.exportNote(note.id)} />
            <button type="button" className="button" onClick={() => setMode("edit")}>
              Edit
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back" onClick={onBack} aria-label="Back to notes">
      ← Notes
    </button>
  );
}
