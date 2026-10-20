/**
 * Tiny crash breadcrumbs. iOS Safari silently reloads a tab when its content process dies (usually memory),
 * which wipes the console. Writing each step to localStorage lets the next page load show where the last one stopped.
 */
const KEY = "mimu:breadcrumbs";
const MAX = 30;

export interface Breadcrumb {
  t: number;
  step: string;
}

let previousSession: Breadcrumb[] = [];
try {
  previousSession = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Breadcrumb[];
  localStorage.setItem(KEY, "[]");
} catch {
  previousSession = [];
}

let current: Breadcrumb[] = [];

export function crumb(step: string): void {
  current = [...current, { t: Date.now(), step }].slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private mode, quota); breadcrumbs are best-effort.
  }
}

/** Steps recorded by the previous page load, oldest first. Empty on a clean first visit. */
export function previousBreadcrumbs(): Breadcrumb[] {
  return previousSession;
}
