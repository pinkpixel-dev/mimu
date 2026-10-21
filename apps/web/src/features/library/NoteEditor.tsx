import { useId, useState, type FormEvent } from "react";
import type { Note, NotePatch } from "@mimu/shared";
import type { Category } from "../../lib/api/client.ts";
import { fallbackTitle } from "../../lib/format.ts";

interface Props {
  note: Note;
  categories: Category[];
  onSave: (patch: NotePatch) => Promise<void>;
  onCancel: () => void;
}

/** Manual edit. Saving marks the note user-edited, so the background worker never overwrites it. */
export function NoteEditor({ note, categories, onSave, onCancel }: Props) {
  const listId = useId();
  const [title, setTitle] = useState(note.title ?? fallbackTitle(note.raw_text));
  const [category, setCategory] = useState(note.category ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [markdown, setMarkdown] = useState(note.markdown ?? note.raw_text);
  const [state, setState] = useState<{ saving: boolean; error?: string }>({ saving: false });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ saving: true });
    try {
      await onSave({
        title: title.trim(),
        markdown: markdown.trim(),
        category: category.trim() || null,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
    } catch (error) {
      setState({ saving: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Title</span>
        <input className="field__input" value={title} required maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="editor__row">
        <label className="field">
          <span className="field__label">Category</span>
          <input className="field__input" list={listId} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c.slug} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="field__label">Tags</span>
          <input className="field__input" value={tags} placeholder="cli, ideas" onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Note</span>
        <textarea className="field__input editor__body" value={markdown} required rows={12} onChange={(e) => setMarkdown(e.target.value)} />
      </label>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="editor__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={state.saving}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={state.saving}>
          {state.saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
