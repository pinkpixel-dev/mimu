import type {
  AskAnswerInput,
  AskFailInput,
  ClaimedAsk,
  ClaimedNote,
  CompleteInput,
  Digest,
  DigestInput,
  FailInput,
  Note,
  WorkerStatus,
} from "@mimu/shared";
import { WORKER_HEADER } from "@mimu/shared";

export interface NoteSearch {
  q?: string;
  match?: "all" | "any";
  from?: string;
  to?: string;
  due?: string;
  limit?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The worker's only way to touch notes. It never talks to the database directly. */
export class MimuApi {
  constructor(
    private readonly baseUrl: string,
    private readonly accessKey: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(response.status, body?.error ?? response.statusText);
    }
    if (response.status === 204) return null as T;
    // The deployed Worker serves the web app for any path outside /api, so a missing /api comes back as HTML.
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new ApiError(response.status, `Expected JSON from ${this.baseUrl}${path}. Does MIMU_API_URL end in /api?`);
    }
    return (await response.json()) as T;
  }

  /** Also the worker's check-in, which is how the app knows the desktop is connected. */
  status(): Promise<WorkerStatus> {
    return this.request("/worker/status", { headers: { [WORKER_HEADER]: "1" } });
  }

  async categories(): Promise<string[]> {
    const body = await this.request<{ categories: { name: string }[] }>("/categories");
    return body.categories.map((category) => category.name);
  }

  async claim(limit: number): Promise<ClaimedNote[]> {
    const body = await this.request<{ notes: ClaimedNote[] }>("/worker/claim", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
    return body.notes;
  }

  complete(id: string, input: CompleteInput): Promise<Note> {
    return this.request(`/worker/complete/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(input) });
  }

  async fail(id: string, input: FailInput): Promise<void> {
    await this.request(`/worker/fail/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(input) });
  }

  async searchNotes(search: NoteSearch): Promise<Note[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== "") params.set(key, String(value));
    return (await this.request<{ notes: Note[] }>(`/notes?${params}`)).notes;
  }

  async latestDigest(): Promise<Digest | null> {
    return (await this.request<{ digest: Digest | null }>("/digests/latest")).digest;
  }

  saveDigest(input: DigestInput): Promise<Digest> {
    return this.request("/worker/digests", { method: "POST", body: JSON.stringify(input) });
  }

  async claimAsk(): Promise<ClaimedAsk | null> {
    return (await this.request<{ ask: ClaimedAsk | null }>("/worker/asks/claim", { method: "POST" })).ask;
  }

  async answerAsk(id: string, input: AskAnswerInput): Promise<void> {
    await this.request(`/worker/asks/${encodeURIComponent(id)}/answer`, { method: "POST", body: JSON.stringify(input) });
  }

  async failAsk(id: string, input: AskFailInput): Promise<void> {
    await this.request(`/worker/asks/${encodeURIComponent(id)}/fail`, { method: "POST", body: JSON.stringify(input) });
  }
}
