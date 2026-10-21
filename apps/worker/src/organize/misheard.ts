import type { Ollama } from "ollama";
import { z } from "zod";

/**
 * A small, separate pass that only looks for speech-recognition mistakes. Asking for this inside the main organize
 * call caught far fewer (the model rewrites the note first and smooths the odd words away).
 */
const MisheardResult = z.object({ misheard: z.array(z.string()).max(5) });
const misheardSchema = z.toJSONSchema(MisheardResult, { target: "draft-7" });

const MISHEARD_PROMPT = `You proofread voice-note transcripts made by speech recognition.
Find words that were probably misheard: a word or short phrase that makes no sense in its sentence.
Example: in "renew the car insurance pelican", the phrase "insurance pelican" makes no sense.
Copy each odd phrase exactly as it appears, 2 to 6 words. Ignore filler words, casual grammar, slang, names,
titles of books, songs, movies, or products (even strange-sounding ones), and ordinary uncertainty like
"I should look into that". If every phrase makes sense, return an empty list.`;

export async function findMisheard(client: Ollama, model: string, rawText: string): Promise<string[]> {
  const response = await client.chat({
    model,
    think: false,
    format: misheardSchema,
    options: { temperature: 0 },
    messages: [
      { role: "system", content: MISHEARD_PROMPT },
      { role: "user", content: rawText },
    ],
  });
  const parsed = MisheardResult.safeParse(JSON.parse(response.message.content));
  return parsed.success ? keepVerbatim(parsed.data.misheard, rawText) : [];
}

/** Only keep phrases that really appear in the transcript, so the model can't invent a "mistake". */
export function keepVerbatim(phrases: readonly string[], rawText: string): string[] {
  const haystack = normalize(rawText);
  const kept = new Set<string>();
  for (const phrase of phrases) {
    const trimmed = phrase.trim().replace(/^["'“”]+|["'“”.,!?]+$/g, "");
    if (trimmed.split(/\s+/).length <= 8 && haystack.includes(normalize(trimmed)) && normalize(trimmed)) kept.add(trimmed);
  }
  return [...kept];
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
