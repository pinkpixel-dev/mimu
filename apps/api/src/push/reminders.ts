import type { Client } from "@libsql/client";
import { listSubscriptions, markReminded, reminderCandidates } from "../repo/push.ts";
import { sendToAll, type PushConfig } from "./send.ts";
import { zonedTimeToUtc } from "./time.ts";

/** Reminders go out this long before a note's due time. */
export const REMINDER_LEAD_MS = 30 * 60 * 1000;
/** A reminder the cron missed (Worker hiccup) still goes out this long after the due time, then it's skipped. */
const LATE_GRACE_MS = 15 * 60 * 1000;

const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

function clock(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * Push a reminder for every note due within the next 30 minutes. Runs from the Worker's 5-minute cron, so it works
 * with the desktop off. Each note is reminded once. Returns the ids that were reminded.
 */
export async function sendDueReminders(db: Client, push: PushConfig, now = new Date()): Promise<string[]> {
  if ((await listSubscriptions(db)).length === 0) return [];
  const t = now.getTime();
  // Due dates are local days, so look one day either side of today in UTC to cover every timezone.
  const days = [dayKey(t - 86_400_000), dayKey(t), dayKey(t + 86_400_000)];
  const reminded: string[] = [];
  for (const note of await reminderCandidates(db, days)) {
    let dueAt: number;
    try {
      dueAt = zonedTimeToUtc(note.due_date, note.due_time, note.tz ?? "UTC").getTime();
    } catch {
      continue;
    }
    if (t < dueAt - REMINDER_LEAD_MS || t > dueAt + LATE_GRACE_MS) continue;
    // Mark first, so a slow or failing push service can't cause a second reminder on the next run.
    await markReminded(db, note.id, now);
    await sendToAll(db, push, {
      title: note.title,
      body: `At ${clock(note.due_time)}`,
      url: `#/note/${encodeURIComponent(note.id)}`,
      tag: `reminder-${note.id}`,
    });
    reminded.push(note.id);
  }
  return reminded;
}
