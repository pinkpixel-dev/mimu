import { test } from "node:test";
import assert from "node:assert/strict";
import { keepVerbatim } from "./misheard.ts";

const transcript = "need to fix the login bug, users get a four oh three when the token cinnamons after an hour";

test("keeps phrases that really appear, ignoring case, punctuation, and wrapping quotes", () => {
  assert.deepEqual(keepVerbatim(["Token Cinnamons", "“the login bug.”"], transcript), ["Token Cinnamons", "the login bug"]);
});

test("drops phrases the model made up or paraphrased", () => {
  assert.deepEqual(keepVerbatim(["token expires", "insurance pelican", ""], transcript), []);
});

test("drops whole-sentence 'phrases' and duplicates", () => {
  assert.deepEqual(keepVerbatim([transcript, "token cinnamons", "token cinnamons"], transcript), ["token cinnamons"]);
});
