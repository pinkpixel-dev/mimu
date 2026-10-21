import type { CaptureInput, Note, NotePatch, WorkerStatus } from "@mimu/shared";
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

export interface Category {
  name: string;
  slug: string;
  count: number;
}

export interface Tag {
  slug: string;
  count: number;
}

export interface NoteFilters {
  status?: "unsorted";
  category?: string;
  tag?: string;
  q?: string;
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

  async listNotes(filters: NoteFilters, signal?: AbortSignal): Promise<Note[]> {
    const params = new URLSearchParams({ limit: "200" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return (await this.request<{ notes: Note[] }>(`/notes?${params}`, { signal })).notes;
  }

  getNote(id: string): Promise<Note> {
    return this.request<Note>(`/notes/${encodeURIComponent(id)}`);
  }

  patchNote(id: string, patch: NotePatch): Promise<Note> {
    return this.request<Note>(`/notes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async deleteNote(id: string): Promise<void> {
    await this.request(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async categories(): Promise<Category[]> {
    return (await this.request<{ categories: Category[] }>("/categories")).categories;
  }

  async tags(): Promise<Tag[]> {
    return (await this.request<{ tags: Tag[] }>("/tags")).tags;
  }

  async requestOrganize(): Promise<void> {
    await this.request("/organize", { method: "POST" });
  }

  /** Downloads need the bearer header, so they're fetched as blobs instead of plain links. */
  private async download(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.connection.accessKey}` },
    });
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
    return { blob: await response.blob(), filename };
  }

  exportNote(id: string) {
    return this.download(`/export/notes/${encodeURIComponent(id)}.md`, "note.md");
  }

  exportAll() {
    return this.download("/export/all.zip", "mimu-export.zip");
  }

  workerStatus(): Promise<WorkerStatus> {
    return this.request<WorkerStatus>("/worker/status");
  }
}
