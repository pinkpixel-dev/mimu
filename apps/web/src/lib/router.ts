import { useCallback, useEffect, useState } from "react";

/**
 * Tiny hash router: capture (#/), the library (#/library), one note (#/note/<id>), Ask (#/ask), or Desktop (#/desktop).
 * Hash routes keep the phone's back button working without any server-side routing.
 */
export type Route =
  | { view: "capture" }
  | { view: "library" }
  | { view: "ask" }
  | { view: "desktop" }
  | { view: "note"; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "");
  const note = path.match(/^\/note\/(.+)$/);
  if (note?.[1]) return { view: "note", id: decodeURIComponent(note[1]) };
  if (path.startsWith("/library")) return { view: "library" };
  if (path.startsWith("/ask")) return { view: "ask" };
  if (path.startsWith("/desktop")) return { view: "desktop" };
  return { view: "capture" };
}

export function routeHref(route: Route): string {
  if (route.view === "note") return `#/note/${encodeURIComponent(route.id)}`;
  if (route.view === "ask") return "#/ask";
  if (route.view === "desktop") return "#/desktop";
  return route.view === "library" ? "#/library" : "#/";
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Route) => {
    location.hash = routeHref(next);
  }, []);
  return [route, navigate];
}
