import type { ClaimedNote, CompleteInput, FailInput, Note, WorkerStatus } from "@mimu/shared";

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

  status(): Promise<WorkerStatus> {
    return this.request("/worker/status");
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
}
