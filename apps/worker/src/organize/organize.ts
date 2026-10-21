import type { Ollama } from "ollama";
import { OrganizeResult, organizeJsonSchema } from "@mimu/shared";
import { findMisheard } from "./misheard.ts";
import { ORGANIZE_SYSTEM_PROMPT, buildOrganizeUserMessage } from "./prompt.ts";

export type OrganizedNote = OrganizeResult & { uncertain: string[] };

export interface OrganizeOutcome {
  result: OrganizedNote;
  attempts: number;
  durationMs: number;
}

export class OrganizeError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "OrganizeError";
  }
}

/**
 * Ask Gemma to structure one raw transcript. Output is schema-constrained by Ollama and then
 * validated again with Zod; one retry on invalid output before giving up.
 * A separate small pass flags phrases that look misheard.
 */
export async function organizeNote(
  client: Ollama,
  model: string,
  rawText: string,
  categories: readonly string[],
  maxAttempts = 2,
): Promise<OrganizeOutcome> {
  const started = performance.now();
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.chat({
      model,
      think: false,
      format: organizeJsonSchema,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: ORGANIZE_SYSTEM_PROMPT },
        { role: "user", content: buildOrganizeUserMessage(rawText, categories) },
      ],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.message.content);
    } catch {
      lastError = "Model returned invalid JSON";
      continue;
    }

    const validated = OrganizeResult.safeParse(parsed);
    if (validated.success) {
      // A failed misheard check shouldn't lose a good organize result.
      const uncertain = await findMisheard(client, model, rawText).catch(() => []);
      return { result: { ...validated.data, uncertain }, attempts: attempt, durationMs: performance.now() - started };
    }
    lastError = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }

  throw new OrganizeError(lastError, maxAttempts);
}
