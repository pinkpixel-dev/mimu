/**
 * Build the sample notes every new hosted demo account starts with, by running the real organize pipeline
 * (Gemma + the misheard pass) over a set of sample transcripts. The output is committed, so signup never needs a model.
 *
 *   pnpm --filter @pinkpixel/mimu-worker seed:build [model]
 */
import { writeFile } from "node:fs/promises";
import { Ollama } from "ollama";
import { organizeNote } from "../src/organize/organize.ts";

const model = process.argv[2] ?? "gemma4:e4b";
const output = new URL("../../api/src/hosted/seed-notes.json", import.meta.url);

/** `hours_ago` spreads the notes over a few days, so "what did I save yesterday?" has something to find. */
const SAMPLES: { hours_ago: number; raw_text: string }[] = [
  { hours_ago: 2, raw_text: "pick up more coffee filters, the cone ones not the basket ones" },
  { hours_ago: 5, raw_text: "remind me to call mom on sunday about the thanksgiving plans" },
  {
    hours_ago: 9,
    raw_text: "need to fix the login bug, users get a four oh three when the token cinnamons after an hour",
  },
  {
    hours_ago: 26,
    raw_text:
      "Oh, I just thought of something. What if I made a little terminal tool that finds duplicate files, but instead of just deleting them, it could show me which ones are actually being used? I should probably look into that.",
  },
  {
    hours_ago: 30,
    raw_text:
      "um grocery stuff we're out of oat milk eggs uh the good bread from the bakery not the sliced one and maybe stuff for tacos tuesday",
  },
  {
    hours_ago: 50,
    raw_text: "I want to try that new pasta place on fifth street, Marco said the cacio e pepper is a wardrobe of flavor",
  },
  {
    hours_ago: 54,
    raw_text:
      "random thought but I think the reason I like dark themes isn't the eye strain thing it's more that the colors pop more and it feels calmer at night",
  },
  { hours_ago: 75, raw_text: "look up whether sloths can actually swim, someone said they're good at it" },
];

const client = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });
const categories: string[] = [];
const notes = [];

for (const sample of SAMPLES) {
  const { result, durationMs } = await organizeNote(client, model, sample.raw_text, categories);
  if (!categories.includes(result.category.name)) categories.push(result.category.name);
  notes.push({
    hours_ago: sample.hours_ago,
    raw_text: sample.raw_text,
    title: result.title,
    markdown: result.markdown,
    summary: result.summary,
    category: result.category.name,
    tags: result.tags,
    uncertain: result.uncertain,
  });
  console.log(`${(durationMs / 1000).toFixed(1)}s  ${result.category.name.padEnd(20)} ${result.title}  ${JSON.stringify(result.uncertain)}`);
}

await writeFile(output, `${JSON.stringify({ model_id: model, notes }, null, 2)}\n`);
console.log(`Wrote ${notes.length} notes to ${output.pathname}`);
