import type { Ollama } from "ollama";
import { z } from "zod";

/** Step 1 of Ask Mimu: turn a casual question into search words and an optional date range. */
const SearchPlan = z.object({
  keywords: z.array(z.string()).max(8),
  after: z.string().nullable(),
  before: z.string().nullable(),
});
export type SearchPlan = z.infer<typeof SearchPlan>;
const searchPlanSchema = z.toJSONSchema(SearchPlan, { target: "draft-7" });

const PLAN_PROMPT = `You turn questions about someone's personal voice notes into a search.
Return:
- "keywords": up to 8 words that would appear in a matching note. Include the key nouns and a few close synonyms
  (for example "browser" might also be "web", "chrome"). No filler words like "what", "idea", "note", "remember".
- "after" and "before": dates in YYYY-MM-DD when the question mentions a time ("last week", "yesterday",
  "in March"), otherwise null. Both are inclusive.
- If the question is only about when something was saved ("what did I save yesterday?"), return an empty
  "keywords" list and just the dates. Words like "save", "saved", "today", "talk", "say" are never keywords.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function planSearch(client: Ollama, model: string, question: string, today: Date): Promise<SearchPlan> {
  const response = await client.chat({
    model,
    think: false,
    format: searchPlanSchema,
    options: { temperature: 0 },
    messages: [
      { role: "system", content: PLAN_PROMPT },
      { role: "user", content: `Today is ${formatDay(today)} (${today.toLocaleDateString("en-US", { weekday: "long" })}).\nQuestion: ${question}` },
    ],
  });
  const parsed = SearchPlan.safeParse(JSON.parse(response.message.content));
  if (!parsed.success) return { keywords: fallbackKeywords(question), after: null, before: null };
  const after = parsed.data.after && DATE.test(parsed.data.after) ? parsed.data.after : null;
  const before = parsed.data.before && DATE.test(parsed.data.before) ? parsed.data.before : null;
  // The model likes to swap the question's own words for synonyms ("buy" → "groceries"), so always search those too.
  const keywords = [...new Set([...questionWords(question), ...parsed.data.keywords.map((k) => k.trim().toLowerCase())])]
    .filter(Boolean)
    .slice(0, 8);
  return { keywords, after, before };
}

const STOPWORDS = new Set(
  `a an the and or but of to in on at for from with about by my me i i'm im you your it its is was were be been am are
  do did does doing have has had what whats which who whom whose when where why how that this these those there
  any anything some something all can could would should will need needs want wanted get got go thing things
  idea ideas note notes thought thoughts save saved remember remind told say said talk talked mimu
  today yesterday tomorrow week weeks month months year last ago recently earlier lately ever`.split(/\s+/),
);

/** The question's own meaningful words, minus filler and time words (dates are handled separately). */
export function questionWords(question: string): string[] {
  return (question.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((word) => !STOPWORDS.has(word)).slice(0, 6);
}

/** If the model's plan is unusable, search the question's own words. */
export function fallbackKeywords(question: string): string[] {
  return questionWords(question);
}

export function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local-day boundaries as ISO timestamps for the API's from/to filters. */
export function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function dayEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
