import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMoment, localDay, validateWhen } from "./when.ts";

// Wednesday, October 21, 2026, 3:12 PM in New York (19:12 UTC).
const captured = new Date("2026-10-21T19:12:00Z");
const zone = "America/New_York";

test("describes the capture moment in the note's own timezone", () => {
  assert.equal(describeMoment(captured, zone), "Wednesday, October 21, 2026 at 3:12 PM (America/New_York)");
  // Late evening in New York is already the next day in UTC; the local day is what counts.
  assert.equal(localDay(new Date("2026-10-22T02:30:00Z"), zone), "2026-10-21");
});

test("keeps real dates and times", () => {
  assert.deepEqual(validateWhen({ due_date: "2026-10-22", due_time: "14:00" }, captured, zone), {
    due_date: "2026-10-22",
    due_time: "14:00",
  });
  assert.deepEqual(validateWhen({ due_date: "2026-10-21", due_time: null }, captured, zone), {
    due_date: "2026-10-21",
    due_time: null,
  });
});

test("drops dates that are malformed, impossible, in the past, or far away", () => {
  const none = { due_date: null, due_time: null };
  assert.deepEqual(validateWhen({ due_date: "thursday", due_time: "14:00" }, captured, zone), none);
  assert.deepEqual(validateWhen({ due_date: "2026-02-30", due_time: null }, captured, zone), none);
  assert.deepEqual(validateWhen({ due_date: "2026-10-20", due_time: null }, captured, zone), none);
  assert.deepEqual(validateWhen({ due_date: "2028-01-01", due_time: null }, captured, zone), none);
  assert.deepEqual(validateWhen({ due_date: null, due_time: "09:00" }, captured, zone), none);
});

test("drops a bad time but keeps the date", () => {
  assert.deepEqual(validateWhen({ due_date: "2026-10-22", due_time: "25:00" }, captured, zone), {
    due_date: "2026-10-22",
    due_time: null,
  });
});
