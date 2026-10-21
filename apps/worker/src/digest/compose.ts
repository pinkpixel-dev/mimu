import type { Ollama } from "ollama";
import type { Note } from "@mimu/shared";
import { z } from "zod";

const DigestResult = z.object({ summary: z.string() });
const digestSchema = z.toJSONSchema(DigestResult, { target: "draft-7" });

const DIGEST_PROMPT = `You write Mimu's short morning note for the person whose voice notes these are.
Write 2 to 4 short sentences of plain text. Friendly and calm, not gushy.
- Start with what's happening today, with times when there are any.
- Then one sentence about what they saved yesterday, if anything.
- Only mention things from the notes below. Never invent plans, people, or times.
- No markdown, no lists, no emoji, no greeting longer than one word.`;

const noteLine = (note: Note) => `- ${note.title ?? note.raw_text}${note.summary ? `: ${note.summary}` : ""}`;

/** "2:00 PM" from "14:00". */
export function clock(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function buildDigestInput(today: string, dueToday: Note[], yesterday: Note[]): string {
  const due = dueToday.length
    ? dueToday.map((note) => `${noteLine(note)} (${note.due_time ? `at ${clock(note.due_time)}` : "today, no set time"})`).join("\n")
    : "(nothing)";
  const saved = yesterday.length ? yesterday.map(noteLine).join("\n") : "(nothing)";
  return `Today is ${today}.\n\nHappening today:\n${due}\n\nSaved yesterday:\n${saved}`;
}

/** Used when Gemma is unavailable, so the digest still goes out. */
export function fallbackDigest(dueToday: Note[], yesterday: Note[]): string {
  const parts: string[] = [];
  if (dueToday.length) {
    const items = dueToday.map((note) => `${note.title ?? "a note"}${note.due_time ? ` at ${clock(note.due_time)}` : ""}`);
    parts.push(`Today: ${items.join(", ")}.`);
  }
  if (yesterday.length) parts.push(`Yesterday you saved ${yesterday.length} note${yesterday.length === 1 ? "" : "s"}.`);
  return parts.join(" ");
}

export async function composeDigest(
  client: Ollama,
  model: string,
  today: string,
  dueToday: Note[],
  yesterday: Note[],
): Promise<string> {
  const response = await client.chat({
    model,
    think: false,
    format: digestSchema,
    options: { temperature: 0.3 },
    messages: [
      { role: "system", content: DIGEST_PROMPT },
      { role: "user", content: buildDigestInput(today, dueToday, yesterday) },
    ],
  });
  const parsed = DigestResult.safeParse(JSON.parse(response.message.content));
  const summary = parsed.success ? parsed.data.summary.trim() : "";
  return summary || fallbackDigest(dueToday, yesterday);
}
