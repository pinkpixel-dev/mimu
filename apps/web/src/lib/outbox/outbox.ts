import type { CaptureInput } from "@mimu/shared";
import { ApiError, type ApiClient } from "../api/client.ts";
import { outboxStore } from "./store.ts";

export type SyncState =
  | { status: "idle"; pending: number }
  | { status: "syncing"; pending: number }
  | { status: "offline"; pending: number }
  | { status: "unauthorized"; pending: number };

type Listener = (state: SyncState) => void;

/**
 * Every capture lands in IndexedDB first, then gets uploaded. Anything that fails to reach the API stays queued
 * and is retried on reconnect, on app focus, and after the next save. The note id is created on the device,
 * so a retry after a lost response can't create a duplicate.
 */
export class Outbox {
  private listeners = new Set<Listener>();
  private state: SyncState = { status: "idle", pending: 0 };
  private flushing: Promise<void> | null = null;

  constructor(private readonly api: ApiClient) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async add(rawText: string): Promise<CaptureInput> {
    const capture: CaptureInput = {
      id: crypto.randomUUID(),
      raw_text: rawText.trim(),
      created_at: new Date().toISOString(),
      // Lets Gemma turn "thursday at 2" into the right day and hour where you are.
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    await outboxStore.put(capture);
    void this.flush();
    return capture;
  }

  /**
   * For signing out of an account: try one last upload, then drop anything still queued so it can't end up
   * in whichever account signs in next on this device.
   */
  async clearForSignOut(): Promise<void> {
    await this.flush().catch(() => undefined);
    await outboxStore.clear();
    this.emit({ status: "idle", pending: 0 });
  }

  /** Upload everything queued. Concurrent calls share one run. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    const queued = (await outboxStore.all()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    let pending = queued.length;
    this.emit({ status: pending ? "syncing" : "idle", pending });

    for (const capture of queued) {
      try {
        await this.api.createNote(capture);
      } catch (error) {
        // Wrong or rotated key: stop and let the UI ask for it again.
        if (error instanceof ApiError && error.status === 401) return this.emit({ status: "unauthorized", pending });
        // Network failure or server error: stop and retry later.
        if (!(error instanceof ApiError) || error.status >= 500) return this.emit({ status: "offline", pending });
        // Any other 4xx means the server won't accept this capture as-is. Keep it (never lose a thought) and move on.
        continue;
      }
      await outboxStore.remove(capture.id);
      pending--;
      this.emit({ status: "syncing", pending });
    }
    this.emit({ status: "idle", pending });
  }

  private emit(state: SyncState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
