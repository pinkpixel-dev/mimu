import type { CaptureInput, Note } from "@mimu/shared";
import { normalizeApiUrl, type Connection } from "../connection.ts";

/** Distinguishes "the server said no" from "couldn't reach the server", which the outbox treats differently. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly base: string;

  constructor(private readonly connection: Connection) {
    this.base = normalizeApiUrl(connection.apiUrl);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.connection.accessKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(response.status, body?.error ?? response.statusText);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }

  /** Cheap authenticated call used to check the URL and key when connecting. */
  async verify(): Promise<void> {
    await this.request("/notes?limit=1");
  }

  createNote(input: CaptureInput): Promise<Note> {
    return this.request<Note>("/notes", { method: "POST", body: JSON.stringify(input) });
  }
}
