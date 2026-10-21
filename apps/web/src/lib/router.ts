import { useCallback, useEffect, useState } from "react";

/**
 * Tiny hash router. Three places to be: capture (#/), the library (#/library), or one note (#/note/<id>).
 * Hash routes keep the phone's back button working without any server-side routing.
 */
export type Route = { view: "capture" } | { view: "library" } | { view: "ask" } | { view: "note"; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "");
  const note = path.match(/^\/note\/(.+)$/);
  if (note?.[1]) return { view: "note", id: decodeURIComponent(note[1]) };
  if (path.startsWith("/library")) return { view: "library" };
  if (path.startsWith("/ask")) return { view: "ask" };
  return { view: "capture" };
}

export function routeHref(route: Route): string {
  if (route.view === "note") return `#/note/${encodeURIComponent(route.id)}`;
  if (route.view === "ask") return "#/ask";
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
