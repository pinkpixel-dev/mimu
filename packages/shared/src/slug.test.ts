import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCategory, normalizeTags, slugify } from "./slug.ts";

test("slugify handles punctuation, accents, and ampersands", () => {
  assert.equal(slugify("  Café & Recipes!! "), "cafe-and-recipes");
  assert.equal(slugify("Developer Tools"), "developer-tools");
  assert.equal(slugify("***"), "");
});

test("normalizeTags dedupes variants and caps the count", () => {
  assert.deepEqual(normalizeTags(["CLI", "cli", " Project Idea ", "", "linux", "rust"], 3), [
    "cli",
    "project-idea",
    "linux",
  ]);
});

test("matchCategory reuses exact and near-duplicate categories", () => {
  const existing = ["Developer Tools", "Recipes", "Project Ideas"];
  assert.equal(matchCategory("developer tools", existing), "Developer Tools");
  assert.equal(matchCategory("Developer Tool", existing), "Developer Tools");
  assert.equal(matchCategory("Project Idea", existing), "Project Ideas");
  assert.equal(matchCategory("Gardening", existing), null);
});
