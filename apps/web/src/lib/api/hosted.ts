import { normalizeApiUrl } from "../connection.ts";
import { ApiError } from "./client.ts";

/** What a hosted demo server offers. A single-user install answers 401 here, which means "not hosted". */
export interface AuthConfig {
  hosted: boolean;
  github: boolean;
  open: boolean;
}

export interface DemoAccount {
  github_login: string | null;
  created_at: string;
  expires_at: string;
}

async function post<T>(apiUrl: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${normalizeApiUrl(apiUrl)}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new ApiError(response.status, data?.error ?? response.statusText);
  return data;
}

export async function getAuthConfig(apiUrl: string, signal?: AbortSignal): Promise<AuthConfig> {
  try {
    const response = await fetch(`${normalizeApiUrl(apiUrl)}/auth/config`, { signal });
    if (!response.ok) return { hosted: false, github: false, open: false };
    return (await response.json()) as AuthConfig;
  } catch (error) {
    if (signal?.aborted) throw error;
    return { hosted: false, github: false, open: false };
  }
}

/** Create a demo account. Returns its access key. */
export async function createDemoAccount(apiUrl: string): Promise<string> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (await post<{ key: string }>(apiUrl, "/accounts", { tz })).key;
}

/** Swap the one-time code from GitHub sign-in for an access key. */
export async function exchangeLoginCode(apiUrl: string, code: string): Promise<string> {
  return (await post<{ key: string }>(apiUrl, "/auth/exchange", { code })).key;
}

export function githubSignInUrl(apiUrl: string): string {
  return `${normalizeApiUrl(apiUrl)}/auth/github/start`;
}
