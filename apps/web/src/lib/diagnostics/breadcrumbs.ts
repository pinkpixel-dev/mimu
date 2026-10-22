/**
 * Tiny load breadcrumbs. iOS Safari silently reloads a tab when its content process dies (usually memory),
 * which wipes the console. Steps are kept in localStorage under `mimu:breadcrumbs` for the current page load.
 */
const KEY = "mimu:breadcrumbs";
const MAX = 30;

interface Breadcrumb {
  t: number;
  step: string;
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
