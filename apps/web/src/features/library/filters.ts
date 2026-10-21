import type { NoteFilters } from "../../lib/api/client.ts";

/** What the library is currently showing. Search is separate and narrows whatever filter is active. */
export type LibraryFilter =
  | { kind: "all" }
  | { kind: "unsorted" }
  | { kind: "category"; slug: string; name: string }
  | { kind: "tag"; slug: string };

export function toQuery(filter: LibraryFilter, q: string): NoteFilters {
  const query: NoteFilters = q.trim() ? { q: q.trim() } : {};
  if (filter.kind === "unsorted") query.status = "unsorted";
  if (filter.kind === "category") query.category = filter.slug;
  if (filter.kind === "tag") query.tag = filter.slug;
  return query;
}

export function filterLabel(filter: LibraryFilter): string {
  switch (filter.kind) {
    case "all":
      return "All notes";
    case "unsorted":
      return "Unsorted";
    case "category":
      return filter.name;
    case "tag":
      return `#${filter.slug}`;
  }
}

export function sameFilter(a: LibraryFilter, b: LibraryFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "category" && b.kind === "category") return a.slug === b.slug;
  if (a.kind === "tag" && b.kind === "tag") return a.slug === b.slug;
  return true;
}
