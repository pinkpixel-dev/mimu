import { test } from "node:test";
import assert from "node:assert/strict";
import { stripIds } from "./answer.ts";
import { dayEnd, dayStart, fallbackKeywords, formatDay, questionWords } from "./plan.ts";

test("stripIds removes leaked note ids but keeps the sentence", () => {
  const ids = ["c42bfac2-9f33-44a8-9a7b-6feb26eeaa68", "seed-d96de64f5876"];
  assert.equal(
    stripIds(`You saved two notes. note_ids: ["${ids[0]}", "${ids[1]}"]`, ids),
    "You saved two notes.",
  );
  assert.equal(stripIds(`That was in your sloth note (${ids[1]}).`, ids), "That was in your sloth note.");
  assert.equal(stripIds("Nothing to strip here.", ids), "Nothing to strip here.");
});

test("date helpers cover the whole local day", () => {
  assert.equal(formatDay(new Date(2026, 9, 20, 23, 30)), "2026-10-20");
  assert.ok(new Date(dayStart("2026-10-20")) < new Date(dayEnd("2026-10-20")));
  assert.equal(new Date(dayEnd("2026-10-20")).getTime() - new Date(dayStart("2026-10-20")).getTime(), 86_399_999);
});

test("question words keep short meaningful words and drop filler and time words", () => {
  assert.deepEqual(questionWords("What do I need to buy?"), ["buy"]);
  assert.deepEqual(questionWords("what was my terminal browser idea?"), ["terminal", "browser"]);
  assert.deepEqual(questionWords("what did I save today?"), []);
  assert.deepEqual(fallbackKeywords("Who do I need to call about the CI build?"), ["call", "ci", "build"]);
});
