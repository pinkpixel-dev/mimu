/**
 * Spike: compare Gemma 4 tags on the organize task.
 * Runs every fixture transcript through each model, carrying categories forward the way the real worker will,
 * and prints validity, attempts, timing, and the category each note landed in.
 *
 *   pnpm --filter @mimu/worker spike:gemma gemma4:e4b gemma4:12b
 */
import { readFile } from "node:fs/promises";
import { Ollama } from "ollama";
import { MAX_TAGS, matchCategory, normalizeTags } from "@mimu/shared";
import { OrganizeError, organizeNote } from "../src/organize/organize.ts";

const models = process.argv.slice(2);
if (models.length === 0) models.push("gemma4:e4b");

const transcripts = JSON.parse(
  await readFile(new URL("../fixtures/transcripts.json", import.meta.url), "utf8"),
) as string[];

const client = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });

for (const model of models) {
  console.log(`\n=== ${model} ===`);
  const categories: string[] = [];
  const timings: number[] = [];
  let failures = 0;
  let retries = 0;

  // Warm-up so model load time doesn't skew the first note.
  await client.generate({ model, prompt: "ok", options: { num_predict: 1 } });

  for (const [i, raw] of transcripts.entries()) {
    try {
      const { result, attempts, durationMs } = await organizeNote(client, model, raw, categories);
      timings.push(durationMs);
      if (attempts > 1) retries++;
      const existing = matchCategory(result.category.name, categories);
      const category = existing ?? result.category.name;
      if (!existing) categories.push(category);
      const tags = normalizeTags(result.tags, MAX_TAGS);
      console.log(
        `#${i + 1} ${(durationMs / 1000).toFixed(1)}s  [${category}${existing ? "" : " (new)"}]  ${result.title}  {${tags.join(", ")}}` +
          (result.uncertain.length ? `  ?${JSON.stringify(result.uncertain)}` : ""),
      );
      if (process.env.SHOW_MD) console.log(result.markdown.replace(/^/gm, "    "), "\n");
    } catch (error) {
      failures++;
      const message = error instanceof OrganizeError ? error.message : String(error);
      console.log(`#${i + 1} FAILED: ${message}`);
    }
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  console.log(
    `\n${model}: ${transcripts.length - failures}/${transcripts.length} valid, ${retries} needed a retry, ` +
      `median ${(median / 1000).toFixed(1)}s, ${categories.length} categories: ${categories.join(" | ")}`,
  );
}
