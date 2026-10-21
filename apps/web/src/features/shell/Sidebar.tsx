import type { Category, Tag } from "../../lib/api/client.ts";
import type { Outbox } from "../../lib/outbox/outbox.ts";
import type { Route } from "../../lib/router.ts";
import { SyncBadge } from "../capture/SyncBadge.tsx";
import { sameFilter, type LibraryFilter } from "../library/filters.ts";

interface Props {
  route: Route;
  filter: LibraryFilter;
  categories: Category[];
  tags: Tag[];
  outbox: Outbox;
  onCapture: () => void;
  onAsk: () => void;
  onFilter: (filter: LibraryFilter) => void;
  onReconnect: () => void;
}

/** Desktop navigation. Hidden on narrow screens, where the bottom tab bar and filter chips take over. */
export function Sidebar({ route, filter, categories, tags, outbox, onCapture, onAsk, onFilter, onReconnect }: Props) {
  const inLibrary = route.view === "library" || route.view === "note";
  const item = (target: LibraryFilter, label: string, count?: number) => (
    <li key={label}>
      <button
        type="button"
        className="nav-item"
        aria-current={inLibrary && sameFilter(filter, target) ? "page" : undefined}
        onClick={() => onFilter(target)}
      >
        <span className="nav-item__label">{label}</span>
        {count !== undefined && <span className="nav-item__count">{count}</span>}
      </button>
    </li>
  );

  return (
    <nav className="sidebar" aria-label="Mimu">
      <div className="sidebar__top">
        <span className="sidebar__brand">Mimu</span>
        <SyncBadge outbox={outbox} onReconnect={onReconnect} />
      </div>
      <ul className="sidebar__group">
        <li>
          <button type="button" className="nav-item" aria-current={route.view === "capture" ? "page" : undefined} onClick={onCapture}>
            <span className="nav-item__label">Capture</span>
          </button>
        </li>
        <li>
          <button type="button" className="nav-item" aria-current={route.view === "ask" ? "page" : undefined} onClick={onAsk}>
            <span className="nav-item__label">Ask Mimu</span>
          </button>
        </li>
        {item({ kind: "unsorted" }, "Unsorted")}
        {item({ kind: "all" }, "All notes")}
      </ul>
      {categories.length > 0 && (
        <>
          <p className="sidebar__heading">Categories</p>
          <ul className="sidebar__group">
            {categories.map((c) => item({ kind: "category", slug: c.slug, name: c.name }, c.name, c.count))}
          </ul>
        </>
      )}
      {tags.length > 0 && (
        <>
          <p className="sidebar__heading">Tags</p>
          <ul className="sidebar__group">{tags.slice(0, 20).map((t) => item({ kind: "tag", slug: t.slug }, `#${t.slug}`, t.count))}</ul>
        </>
      )}
    </nav>
  );
}
