import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "@mimu/shared";
import type { ApiClient, Category, Tag } from "../../lib/api/client.ts";
import { toQuery, type LibraryFilter } from "./filters.ts";

const SEARCH_DEBOUNCE_MS = 250;
/** While anything is still waiting to be organized, check back this often so notes flip to organized on their own. */
const UNSORTED_REFRESH_MS = 15_000;
/** Right after Organize now, check much more often so notes flip as soon as Gemma is done. */
const BOOSTED_REFRESH_MS = 2500;
const BOOST_DURATION_MS = 60_000;

export type NotesState =
  | { status: "loading"; notes: Note[] }
  | { status: "ready"; notes: Note[] }
  | { status: "error"; notes: Note[]; message: string };

export function useTaxonomy(api: ApiClient) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const refresh = useCallback(async () => {
    try {
      const [nextCategories, nextTags] = await Promise.all([api.categories(), api.tags()]);
      setCategories(nextCategories);
      setTags(nextTags);
    } catch {
      // Sidebar counts are nice-to-have; the note list shows the real error if the API is down.
    }
  }, [api]);
  useEffect(() => void refresh(), [refresh]);
  return { categories, tags, refresh };
}

export function useNotes(api: ApiClient, filter: LibraryFilter, search: string, active: boolean) {
  const [state, setState] = useState<NotesState>({ status: "loading", notes: [] });
  const [query, setQuery] = useState(() => toQuery(filter, search));
  const [boosted, setBoosted] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Debounce typing; filter changes apply immediately. (`query` is read but deliberately not a dependency.)
  useEffect(() => {
    const next = toQuery(filter, search);
    const typing = (next.q ?? "") !== (query.q ?? "");
    const timer = setTimeout(() => setQuery(next), typing ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [filter, search]);

  const load = useCallback(
    async (quiet = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (!quiet) setState((current) => ({ status: "loading", notes: current.notes }));
      try {
        const notes = await api.listNotes(query, controller.signal);
        setState({ status: "ready", notes });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setState((current) => ({ status: "error", notes: current.notes, message }));
      }
    },
    [api, query],
  );

  useEffect(() => {
    if (active) void load();
    return () => controllerRef.current?.abort();
  }, [active, load]);

  const unsorted = state.notes.filter((note) => note.status !== "processed").length;
  useEffect(() => {
    if (!active || unsorted === 0) return;
    const timer = setInterval(() => void load(true), boosted ? BOOSTED_REFRESH_MS : UNSORTED_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, unsorted > 0, boosted, load]);

  useEffect(() => {
    if (!boosted) return;
    const timer = setTimeout(() => setBoosted(false), BOOST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [boosted]);

  /** Call after Organize now: poll every few seconds for a minute instead of every 15. */
  const boost = useCallback(() => setBoosted(true), []);

  return { state, reload: load, unsorted, boost };
}
