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

/** Build-time default so a deployed PWA can prefill its own API. */
export const DEFAULT_API_URL: string = import.meta.env.VITE_API_URL ?? "";
