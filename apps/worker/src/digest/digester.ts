import type { Ollama } from "ollama";
import type { MimuApi } from "../api.ts";
import { log } from "../log.ts";
import { LOCAL_TIME_ZONE } from "../runner.ts";
import { localDay } from "../organize/when.ts";
import { composeDigest } from "./compose.ts";
import { notifyDesktop } from "./notify.ts";

/** Local midnight at the start of `day` (YYYY-MM-DD) on this computer, as an ISO instant. */
function localMidnight(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!).toISOString();
}

/**
 * Writes the morning digest once a day, at `hour` on this computer's clock. If the computer was off at that time,
 * the digest gets written the first time the worker runs later that day. Days with nothing due and nothing saved
 * get no digest, so there's no empty notification.
 */
export class Digester {
  private doneFor: string | null = null;
  private running = false;

  constructor(
    private readonly api: MimuApi,
    private readonly ollama: Ollama,
    private readonly model: string,
    private readonly hour: number,
  ) {}

  async tick(now = new Date()): Promise<void> {
    const today = localDay(now, LOCAL_TIME_ZONE);
    if (this.running || this.doneFor === today || now.getHours() < this.hour) return;
    this.running = true;
    try {
      const latest = await this.api.latestDigest();
      if (latest?.date === today) {
        this.doneFor = today;
        return;
      }

      const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12), LOCAL_TIME_ZONE);
      const [dueToday, savedYesterday] = await Promise.all([
        this.api.searchNotes({ due: today, limit: 50 }),
        this.api.searchNotes({ from: localMidnight(yesterday), to: localMidnight(today), limit: 50 }),
      ]);
      if (dueToday.length === 0 && savedYesterday.length === 0) {
        this.doneFor = today;
        log.info("Morning digest: nothing due today and nothing saved yesterday, skipping");
        return;
      }

      const summary = await composeDigest(this.ollama, this.model, today, dueToday, savedYesterday);
      await this.api.saveDigest({
        date: today,
        tz: LOCAL_TIME_ZONE,
        summary,
        note_ids: [...new Set([...dueToday, ...savedYesterday].map((note) => note.id))],
      });
      this.doneFor = today;
      log.info(`Morning digest written: ${summary}`);
      await notifyDesktop("Mimu", summary);
    } catch (error) {
      // Try again on the next tick.
      log.warn(`Morning digest failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.running = false;
    }
  }
}
