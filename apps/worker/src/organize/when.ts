import type { Ollama } from "ollama";
import { z } from "zod";

/**
 * A small, separate pass that finds when a note says something should happen ("thursday at 2", "the first").
 * The prompt only tells Gemma what day and time it was captured. In the spike (scripts/spike-dates.ts) that got
 * 32/32, while adding a calendar cheat sheet made it worse.
 */
const WhenResult = z.object({ due_date: z.string().nullable(), due_time: z.string().nullable() });
const whenSchema = z.toJSONSchema(WhenResult, { target: "draft-7" });

const WHEN_PROMPT = `You read one voice note and decide whether it mentions when something should happen.
Return due_date as YYYY-MM-DD and due_time as 24-hour HH:MM.
- Only set a date if the note says or clearly implies a day ("tomorrow", "thursday", "the 3rd", "in two weeks", "tonight").
- Only set a time if the note says one ("at 2", "9:30", "at 8"). "at 2" or "at 8" with no am/pm means the afternoon or evening.
- Vague words like "sometime", "soon", or "later" are not dates. Ideas and thoughts usually have no date.
- Use null for anything the note doesn't say.`;

export interface When {
  due_date: string | null;
  due_time: string | null;
}

/** The capture moment as the model should hear it, e.g. "Wednesday, October 21, 2026, 3:12 PM (America/New_York)". */
export function describeMoment(capturedAt: Date, timeZone: string): string {
  const label = capturedAt.toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${label} (${timeZone})`;
}

/** The capture day as YYYY-MM-DD in the note's timezone. */
export function localDay(at: Date, timeZone: string): string {
  return at.toLocaleDateString("en-CA", { timeZone });
}

const DAY_MS = 86_400_000;
/** Due dates further out than this are almost certainly a misread, so they're dropped. */
const MAX_DAYS_AHEAD = 400;

/**
 * Keep only answers that are real calendar dates, not in the past (relative to the capture day), and not absurdly
 * far ahead. A time without a date is dropped too.
 */
export function validateWhen(raw: When, capturedAt: Date, timeZone: string): When {
  const date = raw.due_date?.trim() ?? null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { due_date: null, due_time: null };
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { due_date: null, due_time: null };
  const today = new Date(`${localDay(capturedAt, timeZone)}T00:00:00Z`);
  const days = (parsed.getTime() - today.getTime()) / DAY_MS;
  if (days < 0 || days > MAX_DAYS_AHEAD) return { due_date: null, due_time: null };
  const time = raw.due_time?.trim() ?? null;
  return { due_date: date, due_time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null };
}

export async function findWhen(
  client: Ollama,
  model: string,
  rawText: string,
  capturedAt: Date,
  timeZone: string,
): Promise<When> {
  const response = await client.chat({
    model,
    think: false,
    format: whenSchema,
    options: { temperature: 0 },
    messages: [
      { role: "system", content: WHEN_PROMPT },
      { role: "user", content: `It is now ${describeMoment(capturedAt, timeZone)}.\n\nNote: ${rawText}` },
    ],
  });
  const parsed = WhenResult.safeParse(JSON.parse(response.message.content));
  return parsed.success ? validateWhen(parsed.data, capturedAt, timeZone) : { due_date: null, due_time: null };
}
