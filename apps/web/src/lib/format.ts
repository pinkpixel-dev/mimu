const sameYear = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const otherYear = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return (date.getFullYear() === new Date().getFullYear() ? sameYear : otherYear).format(date);
}

/** A title for notes Mimu hasn't organized yet: the start of the transcript. */
export function fallbackTitle(rawText: string): string {
  const firstLine = rawText.trim().split(/\n/)[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
}

const dueDay = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dueClock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** Today's date as YYYY-MM-DD on this device. */
export function todayKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

/**
 * "Today, 2:00 PM", "Tomorrow", or "Thu, Oct 23, 9:30 AM". Due dates are calendar days in the note's own
 * timezone, so they're formatted as plain dates (pinned to UTC) rather than converted.
 */
export function formatDue(date: string, time: string | null, now = new Date()): string {
  const day = new Date(`${date}T${time ?? "00:00"}:00Z`);
  const today = todayKey(now);
  const tomorrow = todayKey(new Date(now.getTime() + 86_400_000));
  const label = date === today ? "Today" : date === tomorrow ? "Tomorrow" : dueDay.format(day);
  return time ? `${label}, ${dueClock.format(day)}` : label;
}
