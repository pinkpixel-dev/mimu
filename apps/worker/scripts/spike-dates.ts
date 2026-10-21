/**
 * Spike: can Gemma pull a due date and time out of a voice note? Compares a plain "it is now X" prompt with one
 * that also lists the next few weeks as a calendar, so "Thursday" is a lookup instead of date math.
 *
 *   pnpm --filter @pinkpixel/mimu-worker spike:dates [model] [runs]
 */
import { Ollama } from "ollama";
import { z } from "zod";

const model = process.argv[2] ?? "gemma4:e4b";
const runs = Number(process.argv[3] ?? 2);

// Captured Wednesday, October 21, 2026 at 3:12 PM in New York.
const CAPTURED = { iso: "2026-10-21T15:12", zone: "America/New_York", label: "Wednesday, October 21, 2026, 3:12 PM" };

/** `dates`: acceptable answers (null = no due date). `time`: expected HH:MM, "any", or null for no time. */
const CASES: { text: string; dates: (string | null)[]; time: string | null | "any" }[] = [
  { text: "call the dentist thursday at 2", dates: ["2026-10-22"], time: "14:00" },
  { text: "remind me to call mom on sunday about the thanksgiving plans", dates: ["2026-10-25"], time: null },
  { text: "standup got moved to 9:30 tomorrow", dates: ["2026-10-22"], time: "09:30" },
  { text: "pay rent on the first", dates: ["2026-11-01"], time: null },
  { text: "dentist appointment is november 3rd at 10am", dates: ["2026-11-03"], time: "10:00" },
  { text: "halloween party at jess's place at 8", dates: ["2026-10-31"], time: "20:00" },
  { text: "in two weeks I need to renew my passport", dates: ["2026-11-04"], time: null },
  { text: "dinner with sam next friday at 7", dates: ["2026-10-23", "2026-10-30"], time: "19:00" },
  { text: "this weekend I really need to clean the garage", dates: ["2026-10-24", "2026-10-25"], time: "any" },
  { text: "submit the hackathon post by saturday night", dates: ["2026-10-24"], time: "any" },
  { text: "remind me tonight to take the trash out", dates: ["2026-10-21"], time: "any" },
  { text: "pick up the dry cleaning tomorrow", dates: ["2026-10-22"], time: null },
  { text: "random thought, I think dark themes feel calmer at night", dates: [null], time: null },
  { text: "pick up more coffee filters, the cone ones not the basket ones", dates: [null], time: null },
  { text: "I should probably look into that terminal tool idea sometime", dates: [null], time: null },
  { text: "what if the sloth app had a little wiggle animation when it saves", dates: [null], time: null },
];

const When = z.object({ due_date: z.string().nullable(), due_time: z.string().nullable() });
const schema = z.toJSONSchema(When, { target: "draft-7" });

const BASE = `You read one voice note and decide whether it mentions when something should happen.
Return due_date as YYYY-MM-DD and due_time as 24-hour HH:MM.
- Only set a date if the note says or clearly implies a day ("tomorrow", "thursday", "the 3rd", "in two weeks", "tonight").
- Only set a time if the note says one ("at 2", "9:30", "at 8"). "at 2" or "at 8" with no am/pm means the afternoon or evening.
- Vague words like "sometime", "soon", or "later" are not dates. Ideas and thoughts usually have no date.
- Use null for anything the note doesn't say.`;

function calendar(): string {
  const start = new Date(`${CAPTURED.iso.slice(0, 10)}T12:00:00Z`);
  const lines: string[] = [];
  for (let i = 0; i < 21; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const weekday = day.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    lines.push(`${weekday} ${day.toISOString().slice(0, 10)}${label}`);
  }
  return lines.join("\n");
}

const variants = {
  plain: (text: string) => `It is now ${CAPTURED.label} (${CAPTURED.zone}).\n\nNote: ${text}`,
  calendar: (text: string) =>
    `It is now ${CAPTURED.label} (${CAPTURED.zone}).\nThe next three weeks:\n${calendar()}\n` +
    `A weekday name on its own means the next one in this list. "Next <weekday>" means the one in the following week.\n\nNote: ${text}`,
};

const client = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });
await client.generate({ model, prompt: "ok", options: { num_predict: 1 } });

for (const [name, build] of Object.entries(variants)) {
  let dateOk = 0;
  let timeOk = 0;
  let falseDates = 0;
  let total = 0;
  const durations: number[] = [];
  const misses: string[] = [];
  for (let run = 1; run <= runs; run++) {
    for (const c of CASES) {
      const started = performance.now();
      const response = await client.chat({
        model,
        think: false,
        format: schema,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: BASE },
          { role: "user", content: build(c.text) },
        ],
      });
      durations.push(performance.now() - started);
      const parsed = When.safeParse(JSON.parse(response.message.content));
      const got = parsed.success ? parsed.data : { due_date: "INVALID", due_time: null };
      total++;
      const dOk = c.dates.includes(got.due_date);
      const tOk = c.time === "any" ? true : got.due_time === c.time;
      if (dOk) dateOk++;
      if (dOk && tOk) timeOk++;
      if (c.dates[0] === null && got.due_date !== null) falseDates++;
      if (!dOk || !tOk) misses.push(`  ${c.text}\n    got ${got.due_date} ${got.due_time}, wanted ${c.dates.join(" or ")} ${c.time}`);
    }
  }
  durations.sort((a, b) => a - b);
  console.log(`\n${name}: date ${dateOk}/${total}, date+time ${timeOk}/${total}, dates on undated notes ${falseDates}, median ${(durations[Math.floor(durations.length / 2)]! / 1000).toFixed(2)}s`);
  for (const miss of [...new Set(misses)]) console.log(miss);
}
