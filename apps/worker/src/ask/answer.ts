import type { Ollama } from "ollama";
import { z } from "zod";
import { noteTitle, type Note } from "@mimu/shared";

/** Step 3 of Ask Mimu: answer from the retrieved notes only, and say which ones were used. */
const AnswerResult = z.object({
  answer: z.string().min(1),
  note_ids: z.array(z.string()),
});
const answerSchema = z.toJSONSchema(AnswerResult, { target: "draft-7" });

const ANSWER_PROMPT = `You are Mimu, a small helper that remembers someone's voice notes for them.
Answer their question using ONLY the notes provided. Speak to them directly, as "you".
Describe each note as what it is: an idea, a reminder, a task, a thought, a list. Don't call everything an idea.
Keep it short: one to four sentences, or a short list if they asked for several things.
Mention when a note was saved if it helps. Never add facts that aren't in the notes.
Never write note ids in the answer text; put them only in "note_ids".
"note_ids": the ids of the notes your answer is based on.
If none of the notes actually answer the question, say you couldn't find it in their notes and return an empty "note_ids".`;

const MAX_NOTE_CHARS = 1200;

export const NOTHING_FOUND = "I couldn't find anything about that in your notes.";

export function formatNotesForPrompt(notes: readonly Note[]): string {
  return notes
    .map((note) => {
      const body = (note.markdown ?? note.raw_text).slice(0, MAX_NOTE_CHARS);
      const saved = new Date(note.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      return `<note id="${note.id}" saved="${saved}" category="${note.category ?? "Unsorted"}">\n# ${noteTitle(note)}\n${body}\n</note>`;
    })
    .join("\n\n");
}

export async function answerFromNotes(
  client: Ollama,
  model: string,
  question: string,
  notes: readonly Note[],
): Promise<{ answer: string; noteIds: string[] }> {
  if (notes.length === 0) return { answer: NOTHING_FOUND, noteIds: [] };
  const response = await client.chat({
    model,
    think: false,
    format: answerSchema,
    options: { temperature: 0.2 },
    messages: [
      { role: "system", content: ANSWER_PROMPT },
      { role: "user", content: `Notes:\n\n${formatNotesForPrompt(notes)}\n\nQuestion: ${question}` },
    ],
  });
  const parsed = AnswerResult.parse(JSON.parse(response.message.content));
  // Only cite notes we actually gave the model.
  const given = new Set(notes.map((note) => note.id));
  return {
    answer: stripIds(parsed.answer, [...given]),
    noteIds: [...new Set(parsed.note_ids)].filter((id) => given.has(id)),
  };
}

/** Belt and braces for the prompt rule: drop a trailing "note_ids: [...]" and any raw note ids from the text. */
export function stripIds(answer: string, ids: readonly string[]): string {
  let text = answer.replace(/\s*\(?note[_ ]ids?:?\s*\[[^\]]*\]\)?\.?/gi, "");
  for (const id of ids) text = text.split(id).join("");
  return text
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .trim();
}
