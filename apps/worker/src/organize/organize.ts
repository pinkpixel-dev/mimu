import type { Ollama } from "ollama";
import { OrganizeResult, organizeJsonSchema } from "@mimu/shared";
import { ORGANIZE_SYSTEM_PROMPT, buildOrganizeUserMessage } from "./prompt.ts";

export interface OrganizeOutcome {
  result: OrganizeResult;
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
      return { result: validated.data, attempts: attempt, durationMs: performance.now() - started };
    }
    lastError = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }

  throw new OrganizeError(lastError, maxAttempts);
}
