import { useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import type { Outbox } from "../../lib/outbox/outbox.ts";
import { useRoute } from "../../lib/router.ts";
import { CaptureScreen } from "../capture/CaptureScreen.tsx";
import type { LibraryFilter } from "../library/filters.ts";
import { LibraryView } from "../library/LibraryView.tsx";
import { useTaxonomy } from "../library/useLibrary.ts";
import { Sidebar } from "./Sidebar.tsx";
import "./shell.css";

interface Props {
  api: ApiClient;
  outbox: Outbox;
  onReconnect: () => void;
}

export function Shell({ api, outbox, onReconnect }: Props) {
  const [route, navigate] = useRoute();
  const [filter, setFilter] = useState<LibraryFilter>({ kind: "all" });
  const { categories, tags, refresh } = useTaxonomy(api);
  const inLibrary = route.view !== "capture";

  const showFilter = (next: LibraryFilter) => {
    setFilter(next);
    navigate({ view: "library" });
  };

  return (
    <div className="shell">
      <Sidebar
        route={route}
        filter={filter}
        categories={categories}
        tags={tags}
        outbox={outbox}
        onCapture={() => navigate({ view: "capture" })}
        onFilter={showFilter}
        onReconnect={onReconnect}
      />

      <div className="shell__main">
        {/* Capture stays mounted so switching tabs doesn't reload the speech model. */}
        <div className="shell__pane" hidden={inLibrary}>
          <CaptureScreen outbox={outbox} onReconnect={onReconnect} />
        </div>
        {inLibrary && (
          <div className="shell__pane">
            <LibraryView
              api={api}
              route={route}
              navigate={navigate}
              filter={filter}
              onFilter={setFilter}
              categories={categories}
              tags={tags}
              onTaxonomyChanged={() => void refresh()}
            />
          </div>
        )}
      </div>

      <nav className="tabbar" aria-label="Sections">
        <button type="button" className="tabbar__tab" aria-current={!inLibrary ? "page" : undefined} onClick={() => navigate({ view: "capture" })}>
          <MicGlyph />
          Capture
        </button>
        <button
          type="button"
          className="tabbar__tab"
          aria-current={inLibrary ? "page" : undefined}
          onClick={() => {
            void refresh();
            navigate({ view: "library" });
          }}
        >
          <NotesGlyph />
          Library
        </button>
      </nav>
    </div>
  );
}

const glyph = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function MicGlyph() {
  return (
    <svg {...glyph} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function NotesGlyph() {
  return (
    <svg {...glyph} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
