/** Where this device's API lives and the access key for it. Entered once per device and kept in localStorage. */
export interface Connection {
  apiUrl: string;
  accessKey: string;
}

const KEY = "mimu:connection";

export function loadConnection(): Connection | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Connection | null;
    return parsed?.apiUrl && parsed.accessKey ? parsed : null;
  } catch {
    return null;
  }
}

export function saveConnection(connection: Connection): void {
  localStorage.setItem(KEY, JSON.stringify({ ...connection, apiUrl: normalizeApiUrl(connection.apiUrl) }));
}

export function clearConnection(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Prefill for the connect screen. A production build is served by the same Worker as the API, so it defaults to
 * this origin's /api. VITE_API_URL overrides that for other setups.
 */
export const DEFAULT_API_URL: string =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${location.origin}/api` : "");
