import { test } from "node:test";
import assert from "node:assert/strict";
import type { Note } from "@mimu/shared";
import { buildDigestInput, clock, fallbackDigest } from "./compose.ts";

const note = (title: string, extra: Partial<Note> = {}) => ({ title, raw_text: title, summary: null, due_time: null, ...extra }) as Note;

test("clock turns 24-hour times into 12-hour ones", () => {
  assert.equal(clock("14:00"), "2:00 PM");
  assert.equal(clock("00:05"), "12:05 AM");
  assert.equal(clock("12:30"), "12:30 PM");
});

test("the prompt lists today's items with their times and yesterday's notes", () => {
  const input = buildDigestInput("Thursday, October 22", [note("Dentist", { due_time: "14:00" }), note("Pay rent")], []);
  assert.match(input, /- Dentist \(at 2:00 PM\)/);
  assert.match(input, /- Pay rent \(today, no set time\)/);
  assert.match(input, /Saved yesterday:\n\(nothing\)/);
});

test("the fallback digest still says something useful without the model", () => {
  assert.equal(
    fallbackDigest([note("Dentist", { due_time: "14:00" })], [note("a"), note("b")]),
    "Today: Dentist at 2:00 PM. Yesterday you saved 2 notes.",
  );
});
