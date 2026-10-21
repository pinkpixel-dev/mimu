/**
 * Spike: does the organize prompt flag misheard phrases without crying wolf on clean notes?
 * Each fixture is marked garbled or clean; we count how often "uncertain" comes back non-empty for each.
 *
 *   pnpm --filter @mimu/worker spike:uncertain [model] [runs]
 */
import { readFile } from "node:fs/promises";
import { Ollama } from "ollama";
import { organizeNote } from "../src/organize/organize.ts";

const model = process.argv[2] ?? "gemma4:e4b";
const runs = Number(process.argv[3] ?? 2);
const fixtures = JSON.parse(await readFile(new URL("../fixtures/uncertain.json", import.meta.url), "utf8")) as {
  garbled: boolean;
  text: string;
}[];

const client = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });
await client.generate({ model, prompt: "ok", options: { num_predict: 1 } });

let garbledFlagged = 0;
let cleanFlagged = 0;
let garbledTotal = 0;
let cleanTotal = 0;

for (let run = 1; run <= runs; run++) {
  for (const fixture of fixtures) {
    const { result } = await organizeNote(client, model, fixture.text, ["Project Ideas", "Tasks", "Personal Reflections"]);
    const flagged = result.uncertain.length > 0;
    if (fixture.garbled) {
      garbledTotal++;
      if (flagged) garbledFlagged++;
    } else {
      cleanTotal++;
      if (flagged) cleanFlagged++;
    }
    const mark = fixture.garbled ? (flagged ? "✓" : "✗ missed") : flagged ? "✗ false alarm" : "✓";
    console.log(`${mark.padEnd(14)} ${JSON.stringify(result.uncertain)}  ←  ${fixture.text.slice(0, 60)}…`);
  }
}

console.log(
  `\n${model}: flagged ${garbledFlagged}/${garbledTotal} garbled, false alarms on ${cleanFlagged}/${cleanTotal} clean`,
);
