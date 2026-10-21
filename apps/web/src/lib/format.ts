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
