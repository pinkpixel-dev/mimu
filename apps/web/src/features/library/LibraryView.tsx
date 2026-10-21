import { useEffect, useRef, useState } from "react";
import type { ApiClient, Category, Tag } from "../../lib/api/client.ts";
import type { Route } from "../../lib/router.ts";
import { EmptyState } from "./EmptyState.tsx";
import { ExportButton } from "./ExportButton.tsx";
import { filterLabel, sameFilter, type LibraryFilter } from "./filters.ts";
import { NoteDetail } from "./NoteDetail.tsx";
import { NoteList } from "./NoteList.tsx";
import { useNotes } from "./useLibrary.ts";
import "./library.css";

interface Props {
  api: ApiClient;
  route: Route;
  navigate: (route: Route) => void;
  filter: LibraryFilter;
  onFilter: (filter: LibraryFilter) => void;
  categories: Category[];
  tags: Tag[];
  onTaxonomyChanged: () => void;
}

export function LibraryView({ api, route, navigate, filter, onFilter, categories, tags, onTaxonomyChanged }: Props) {
  const [search, setSearch] = useState("");
  const [organize, setOrganize] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const { state, reload, unsorted, boost } = useNotes(api, filter, search, true);

  // When notes get organized, new categories and tags may exist, so refresh the sidebar counts.
  const previousUnsorted = useRef(unsorted);
  useEffect(() => {
    if (unsorted < previousUnsorted.current) onTaxonomyChanged();
    previousUnsorted.current = unsorted;
  }, [unsorted, onTaxonomyChanged]);
  const selectedId = route.view === "note" ? route.id : null;

  async function organizeNow() {
    setOrganize("sending");
    try {
      await api.requestOrganize();
      setOrganize("sent");
      boost();
    } catch {
      setOrganize("error");
    }
  }

  const refreshAll = () => {
    void reload(true);
    onTaxonomyChanged();
  };

  const empty =
    search.trim() !== "" ? (
      <EmptyState pose="searching" text="Couldn't find that one." />
    ) : filter.kind === "unsorted" ? (
      <EmptyState pose="waving" text="No unsorted thoughts right now." />
    ) : (
      <EmptyState pose="waving" text="Nothing here yet. Say something on the Capture tab." />
    );

  return (
    <div className="library" data-has-selection={selectedId ? "true" : "false"}>
      <section className="library__list" aria-label="Notes">
        <header className="library__header">
          <label className="search">
            <span className="visually-hidden">Search notes</span>
            <input
              className="field__input search__input"
              type="search"
              placeholder={`Search ${filterLabel(filter).toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="library__actions">
            <button
              type="button"
              className="button"
              onClick={organizeNow}
              disabled={organize === "sending"}
              title="Ask the desktop worker to sort pending notes now"
            >
              {organize === "sent" ? "Asked Mimu" : organize === "error" ? "Try again" : "Organize now"}
            </button>
            <ExportButton
              label="Export all"
              title="Download every note as Markdown in a ZIP"
              className="button button--ghost"
              run={() => api.exportAll()}
            />
          </div>
        </header>

        <div className="chips" role="group" aria-label="Filters">
          <FilterChip filter={{ kind: "all" }} active={filter} onFilter={onFilter} />
          <FilterChip filter={{ kind: "unsorted" }} active={filter} onFilter={onFilter} />
          {categories.map((c) => (
            <FilterChip key={c.slug} filter={{ kind: "category", slug: c.slug, name: c.name }} active={filter} onFilter={onFilter} />
          ))}
          {tags.slice(0, 12).map((t) => (
            <FilterChip key={t.slug} filter={{ kind: "tag", slug: t.slug }} active={filter} onFilter={onFilter} />
          ))}
        </div>

        {state.status === "error" && (
          <p className="form-error library__error" role="alert">
            Couldn't load notes ({state.message}).{" "}
            <button type="button" className="link-button" onClick={() => void reload()}>
              Retry
            </button>
          </p>
        )}
        {state.status !== "error" && state.notes.length === 0 ? (
          state.status === "loading" ? <div className="library__loading" aria-busy="true" /> : empty
        ) : (
          <NoteList notes={state.notes} selectedId={selectedId} />
        )}
      </section>

      <section className="library__detail" aria-label="Note">
        {selectedId ? (
          <NoteDetail
            api={api}
            id={selectedId}
            categories={categories}
            onBack={() => navigate({ view: "library" })}
            onChanged={refreshAll}
            onDeleted={() => {
              refreshAll();
              navigate({ view: "library" });
            }}
          />
        ) : (
          <EmptyState pose="holding" text="Pick a note to read it." />
        )}
      </section>
    </div>
  );
}

function FilterChip({ filter, active, onFilter }: { filter: LibraryFilter; active: LibraryFilter; onFilter: (f: LibraryFilter) => void }) {
  const selected = sameFilter(filter, active);
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={() => onFilter(filter)}>
      {filterLabel(filter)}
    </button>
  );
}
