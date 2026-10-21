import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import type { Connection } from "../../lib/connection.ts";
import type { Outbox } from "../../lib/outbox/outbox.ts";
import { useRoute } from "../../lib/router.ts";
import { AccountView } from "../account/AccountView.tsx";
import { AskView } from "../ask/AskView.tsx";
import { CaptureScreen } from "../capture/CaptureScreen.tsx";
import { DesktopView } from "../desktop/DesktopView.tsx";
import type { LibraryFilter } from "../library/filters.ts";
import { LibraryView } from "../library/LibraryView.tsx";
import { useTaxonomy } from "../library/useLibrary.ts";
import { Sidebar } from "./Sidebar.tsx";
import "./shell.css";

interface Props {
  api: ApiClient;
  connection: Connection;
  outbox: Outbox;
  onReconnect: () => void;
  onSignOut: () => Promise<void>;
}

export function Shell({ api, connection, outbox, onReconnect, onSignOut }: Props) {
  const [route, navigate] = useRoute();
  const [filter, setFilter] = useState<LibraryFilter>({ kind: "all" });
  const { categories, tags, refresh } = useTaxonomy(api);
  const inLibrary = route.view === "library" || route.view === "note";
  const inAsk = route.view === "ask";
  const inDesktop = route.view === "desktop";
  const inAccount = route.view === "account";
  const isDemo = useIsDemoAccount(api);
  const workerNeverSeen = useWorkerNeverSeen(api);

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
        onAsk={() => navigate({ view: "ask" })}
        onDesktop={() => navigate({ view: "desktop" })}
        onAccount={() => navigate({ view: "account" })}
        onFilter={showFilter}
        onReconnect={onReconnect}
      />

      <div className="shell__main">
        {/* Capture stays mounted so switching tabs doesn't reload the speech model. */}
        <div className="shell__pane" hidden={inLibrary || inAsk || inDesktop || inAccount}>
          <CaptureScreen
            outbox={outbox}
            onReconnect={onReconnect}
            onAccount={() => navigate({ view: "account" })}
            onSetUpDesktop={workerNeverSeen ? () => navigate({ view: "desktop" }) : undefined}
          />
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
        {inAsk && (
          <div className="shell__pane">
            <AskView api={api} />
          </div>
        )}
        {inDesktop && (
          <div className="shell__pane">
            <DesktopView api={api} connection={connection} />
          </div>
        )}
        {inAccount && (
          <div className="shell__pane">
            <AccountView api={api} connection={connection} isDemo={isDemo} onSignOut={onSignOut} />
          </div>
        )}
      </div>

      <nav className="tabbar" aria-label="Sections">
        <button type="button" className="tabbar__tab" aria-current={route.view === "capture" ? "page" : undefined} onClick={() => navigate({ view: "capture" })}>
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
        <button type="button" className="tabbar__tab" aria-current={inAsk ? "page" : undefined} onClick={() => navigate({ view: "ask" })}>
          <AskGlyph />
          Ask
        </button>
      </nav>
    </div>
  );
}

/** Whether this key belongs to a hosted demo account (and not a single-user install or the owner). */
function useIsDemoAccount(api: ApiClient): boolean {
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .demoAccount()
      .then((account) => !cancelled && setIsDemo(account !== null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);
  return isDemo;
}

const WORKER_CHECK_MS = 30_000;

/** True until a desktop worker has checked in at least once. Re-checks while it's still waiting. */
function useWorkerNeverSeen(api: ApiClient): boolean {
  const [neverSeen, setNeverSeen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const { worker_seen_at } = await api.workerStatus();
        if (cancelled) return;
        setNeverSeen(worker_seen_at === null);
        if (worker_seen_at !== null) return;
      } catch {
        // Offline or the API hiccuped; try again later without showing anything new.
      }
      if (!cancelled) timer = setTimeout(() => void check(), WORKER_CHECK_MS);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api]);
  return neverSeen;
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

function AskGlyph() {
  return (
    <svg {...glyph} aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  );
}
