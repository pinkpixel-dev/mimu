import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { strFromU8, unzipSync } from "fflate";
import type { ClaimedNote, Note } from "@mimu/shared";
import { createApp } from "./app.ts";
import { migrate } from "./db/migrations.ts";

const KEY = "test-access-key-123";
let dir: string;
let db: Client;
let app: ReturnType<typeof createApp>;

before(async () => {
  // A real file, not :memory:, because libSQL transactions open their own connection.
  dir = await mkdtemp(join(tmpdir(), "mimu-api-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await migrate(db);
  app = createApp(db, KEY);
});

after(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

async function call<T = unknown>(method: string, path: string, body?: unknown, key: string | null = KEY) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key !== null) headers.Authorization = `Bearer ${key}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

let seq = 0;
async function capture(raw_text: string): Promise<Note> {
  const id = `01TESTNOTE${String(++seq).padStart(6, "0")}`;
  const res = await call<Note>("POST", "/notes", { id, raw_text, created_at: new Date(Date.now() + seq).toISOString() });
  assert.equal(res.status, 201);
  return res.body;
}

async function claimAll(): Promise<ClaimedNote[]> {
  return (await call<{ notes: ClaimedNote[] }>("POST", "/worker/claim", { limit: 20 })).body.notes;
}

function organized(claim: ClaimedNote, category: string, tags: string[] = ["test"]) {
  return {
    claim_token: claim.claim_token,
    title: `Title for ${claim.id}`,
    markdown: "Organized body",
    summary: "One line.",
    category,
    tags,
    model_id: "gemma4:e4b",
    processing_version: 1,
  };
}

describe("auth", () => {
  test("health is public, everything else needs the access key", async () => {
    assert.equal((await call("GET", "/health", undefined, null)).status, 200);
    assert.equal((await call("GET", "/notes", undefined, null)).status, 401);
    assert.equal((await call("GET", "/notes", undefined, "wrong-key")).status, 401);
    assert.equal((await call("GET", "/notes")).status, 200);
  });
});

describe("capture", () => {
  test("is idempotent on the client-generated id", async () => {
    const body = { id: "01IDEMPOTENT0000001", raw_text: "remember the milk", created_at: "2026-10-20T09:00:00-04:00" };
    const first = await call<Note>("POST", "/notes", body);
    const second = await call<Note>("POST", "/notes", body);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
    assert.equal(first.body.status, "pending");
    assert.equal(first.body.created_at, "2026-10-20T13:00:00.000Z");
    await call("DELETE", `/notes/${body.id}`);
  });

  test("rejects empty transcripts", async () => {
    const res = await call("POST", "/notes", { id: "01EMPTYNOTE00000001", raw_text: "   ", created_at: new Date().toISOString() });
    assert.equal(res.status, 400);
  });
});

describe("worker flow", () => {
  test("claims, completes, reuses near-duplicate categories, and normalizes tags", async () => {
    const a = await capture("a terminal tool that finds duplicate files");
    const b = await capture("a cli that renames screenshots");
    const claims = await claimAll();
    assert.deepEqual(claims.map((c) => c.id).sort(), [a.id, b.id].sort());
    assert.equal(new Set(claims.map((c) => c.claim_token)).size, 2);
    assert.equal((await claimAll()).length, 0, "claimed notes are not handed out twice");

    const [ca, cb] = [claims.find((c) => c.id === a.id)!, claims.find((c) => c.id === b.id)!];
    const doneA = await call<Note>("POST", `/worker/complete/${a.id}`, organized(ca, "Developer Tools", ["CLI", "cli", "Files"]));
    assert.equal(doneA.status, 200);
    assert.equal(doneA.body.status, "processed");
    assert.deepEqual(doneA.body.tags, ["cli", "files"]);

    const doneB = await call<Note>("POST", `/worker/complete/${b.id}`, organized(cb, "developer tool"));
    assert.equal(doneB.body.category, "Developer Tools");
    const categories = await call<{ categories: { slug: string; count: number }[] }>("GET", "/categories");
    assert.deepEqual(categories.body.categories, [{ name: "Developer Tools", slug: "developer-tools", count: 2 }]);
  });

  test("rejects a stale claim token and retries failed notes", async () => {
    const note = await capture("call the dentist about thursday");
    const [claim] = await claimAll();
    assert.equal(claim?.id, note.id);

    const stale = await call("POST", `/worker/complete/${note.id}`, { ...organized(claim!, "Tasks"), claim_token: "nope" });
    assert.equal(stale.status, 409);

    assert.equal((await call("POST", `/worker/fail/${note.id}`, { claim_token: claim!.claim_token, error: "bad json" })).status, 204);
    const failed = await call<Note>("GET", `/notes/${note.id}`);
    assert.equal(failed.body.status, "failed");
    assert.equal(failed.body.attempt_count, 1);

    assert.equal((await claimAll()).length, 0, "failed notes wait out the retry backoff");
    await db.execute({
      sql: "UPDATE notes SET updated_at = ? WHERE id = ?",
      args: [new Date(Date.now() - 6 * 60 * 1000).toISOString(), note.id],
    });
    const [retry] = await claimAll();
    assert.equal(retry?.id, note.id, "failed notes with attempts left are reclaimed after the backoff");
    assert.equal((await call("POST", `/worker/complete/${note.id}`, organized(retry!, "Tasks"))).status, 200);
  });

  test("never overwrites a note the user edited", async () => {
    const note = await capture("idea for a reader mode in the terminal browser");
    const [claim] = await claimAll();
    const edited = await call<Note>("PATCH", `/notes/${note.id}`, { title: "My own title", tags: ["Mine"] });
    assert.equal(edited.body.user_edited, true);

    assert.equal((await call("POST", `/worker/complete/${note.id}`, organized(claim!, "Project Ideas"))).status, 409);
    const after = await call<Note>("GET", `/notes/${note.id}`);
    assert.equal(after.body.title, "My own title");
    assert.deepEqual(after.body.tags, ["mine"]);
  });

  test("stores the phrases Gemma wasn't sure about", async () => {
    const note = await capture("keep stealing ingredients and mercy");
    const [claim] = await claimAll();
    const done = await call<Note>("POST", `/worker/complete/${note.id}`, {
      ...organized(claim!, "Project Ideas"),
      uncertain: ["stealing ingredients and mercy"],
    });
    assert.deepEqual(done.body.uncertain, ["stealing ingredients and mercy"]);
    assert.deepEqual((await call<Note>("GET", `/notes/${note.id}`)).body.uncertain, ["stealing ingredients and mercy"]);
    const plain = await capture("no uncertainty here");
    assert.deepEqual(plain.uncertain, []);
  });

  test("organize requests show up in worker status", async () => {
    await capture("pending one");
    const requested = await call<{ organize_requested_at: string }>("POST", "/organize");
    const status = await call<{ organize_requested_at: string; pending: number }>("GET", "/worker/status");
    assert.equal(status.body.organize_requested_at, requested.body.organize_requested_at);
    assert.ok(status.body.pending >= 1);
  });

  test("only the desktop worker's status poll counts as a check-in", async () => {
    const fromApp = await call<{ worker_seen_at: string | null }>("GET", "/worker/status");
    assert.equal(fromApp.body.worker_seen_at, null);

    const res = await app.request("/worker/status", { headers: { Authorization: `Bearer ${KEY}`, "X-Mimu-Worker": "1" } });
    const seen = ((await res.json()) as { worker_seen_at: string | null }).worker_seen_at;
    assert.ok(seen && Date.now() - Date.parse(seen) < 5000);

    // A second check-in within the minute doesn't rewrite the timestamp.
    await app.request("/worker/status", { headers: { Authorization: `Bearer ${KEY}`, "X-Mimu-Worker": "1" } });
    assert.equal((await call<{ worker_seen_at: string }>("GET", "/worker/status")).body.worker_seen_at, seen);
  });
});

describe("ask mimu", () => {
  type AskBody = { id: string; status: string; answer: string | null; notes: { id: string; title: string }[] };
  type ClaimBody = { ask: { id: string; question: string; claim_token: string } | null };

  test("queues a question, lets the worker answer it, and resolves cited notes to titles", async () => {
    const note = await capture("what if the terminal had a pomodoro timer built in");
    const created = await call<AskBody>("POST", "/asks", { id: "ask-0000000001", question: "what was my timer idea?" });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "pending");
    assert.equal((await call("POST", "/asks", { id: "ask-0000000001", question: "what was my timer idea?" })).status, 200);

    const claim = (await call<ClaimBody>("POST", "/worker/asks/claim")).body.ask!;
    assert.equal(claim.question, "what was my timer idea?");
    assert.equal((await call<ClaimBody>("POST", "/worker/asks/claim")).body.ask, null, "one worker per question");

    const stale = await call("POST", `/worker/asks/${claim.id}/answer`, { claim_token: "nope", answer: "x", note_ids: [] });
    assert.equal(stale.status, 409);
    const answered = await call("POST", `/worker/asks/${claim.id}/answer`, {
      claim_token: claim.claim_token,
      answer: "A pomodoro timer built into the terminal.",
      note_ids: [note.id, note.id, "deleted-or-made-up"],
    });
    assert.equal(answered.status, 204);

    const ask = await call<AskBody>("GET", `/asks/${claim.id}`);
    assert.equal(ask.body.status, "answered");
    assert.deepEqual(ask.body.notes, [{ id: note.id, title: "what if the terminal had a pomodoro timer built in" }]);
    assert.equal((await call<{ asks: AskBody[] }>("GET", "/asks")).body.asks[0]?.id, claim.id);
  });

  test("failed answers are recorded, and match=any finds notes sharing any word", async () => {
    await call("POST", "/asks", { id: "ask-0000000002", question: "anything about zebras?" });
    const claim = (await call<ClaimBody>("POST", "/worker/asks/claim")).body.ask!;
    assert.equal((await call("POST", `/worker/asks/${claim.id}/fail`, { claim_token: claim.claim_token, error: "ollama down" })).status, 204);
    assert.equal((await call<AskBody>("GET", `/asks/${claim.id}`)).body.status, "failed");

    const all = await call<{ notes: Note[] }>("GET", "/notes?q=pomodoro%20zebras");
    assert.equal(all.body.notes.length, 0, "default search needs every word");
    const any = await call<{ notes: Note[] }>("GET", "/notes?q=pomodoro%20zebras&match=any");
    assert.equal(any.body.notes.length, 1);
  });
});

describe("library queries", () => {
  test("full-text search matches raw text and titles, with prefixes and punctuation", async () => {
    const hit = await capture("what if the kumquat browser had a reader mode");
    await capture("grocery run: oat milk and eggs");
    const results = await call<{ notes: Note[] }>("GET", `/notes?q=${encodeURIComponent('kumq "reader"!')}`);
    assert.deepEqual(results.body.notes.map((n) => n.id), [hit.id]);
    const stemmed = await call<{ notes: Note[] }>("GET", "/notes?q=browsers");
    assert.ok(stemmed.body.notes.some((n) => n.id === hit.id), "porter stemming matches plural forms");
    assert.equal((await call<{ notes: Note[] }>("GET", "/notes?q=%22%22%22")).body.notes.length, 0);
  });

  test("filters by category, tag, and status", async () => {
    const byCategory = await call<{ notes: Note[] }>("GET", "/notes?category=developer-tools");
    assert.equal(byCategory.body.notes.length, 2);
    const byTag = await call<{ notes: Note[] }>("GET", "/notes?tag=files");
    assert.equal(byTag.body.notes.length, 1);
    const pending = await call<{ notes: Note[] }>("GET", "/notes?status=pending");
    assert.ok(pending.body.notes.every((n) => n.status === "pending"));
    const unsorted = await call<{ notes: Note[] }>("GET", "/notes?status=unsorted");
    assert.ok(unsorted.body.notes.length > 0);
    assert.ok(unsorted.body.notes.every((n) => n.status !== "processed"));
  });

  test("exports one note as Markdown and everything as a ZIP with a manifest", async () => {
    const note = await capture("export me: a note about kumquat jam");
    const md = await app.request(`/export/notes/${note.id}.md`, { headers: { Authorization: `Bearer ${KEY}` } });
    assert.equal(md.status, 200);
    assert.match(md.headers.get("content-disposition") ?? "", /attachment; filename=".+\.md"/);
    const text = await md.text();
    assert.match(text, new RegExp(`^---\\nid: "${note.id}"`));
    assert.match(text, /export me: a note about kumquat jam\n$/);
    assert.equal((await call("GET", `/export/notes/${note.id}`)).status, 404);
    assert.equal((await call("GET", "/export/notes/missing.md")).status, 404);

    const zip = await app.request("/export/all.zip", { headers: { Authorization: `Bearer ${KEY}` } });
    assert.equal(zip.headers.get("content-type"), "application/zip");
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files["mimu-export/manifest.json"]!)) as { count: number; notes: { id: string; path: string }[] };
    const total = (await call<{ notes: Note[] }>("GET", "/notes?limit=200")).body.notes.length;
    assert.equal(manifest.count, total);
    assert.equal(Object.keys(files).length, total + 1);
    const entry = manifest.notes.find((n) => n.id === note.id)!;
    assert.ok(entry.path.startsWith("Unsorted/"), "pending notes land in Unsorted/");
    assert.ok(manifest.notes.some((n) => n.path.startsWith("Developer-Tools/")), "processed notes land in their category folder");
    assert.ok(strFromU8(files[`mimu-export/${entry.path}`]!).includes("kumquat jam"));
    assert.equal((await app.request("/export/all.zip")).status, 401);
  });

  test("deletes notes and their tags", async () => {
    const note = await capture("throwaway");
    assert.equal((await call("DELETE", `/notes/${note.id}`)).status, 204);
    assert.equal((await call("GET", `/notes/${note.id}`)).status, 404);
    assert.equal((await call("DELETE", `/notes/${note.id}`)).status, 404);
  });
});

describe("due dates", () => {
  test("the capture's timezone reaches the worker, and the due date comes back on the note", async () => {
    const id = "01DUEDATE000000001";
    await call("POST", "/notes", {
      id,
      raw_text: "call the dentist thursday at 2",
      created_at: "2026-10-21T15:12:00-04:00",
      tz: "America/New_York",
    });
    const claim = (await claimAll()).find((c) => c.id === id);
    assert.ok(claim);
    assert.equal(claim.tz, "America/New_York");
    assert.equal(claim.created_at, "2026-10-21T19:12:00.000Z");

    const done = await call<Note>("POST", `/worker/complete/${id}`, {
      ...organized(claim, "Appointments"),
      due_date: "2026-10-22",
      due_time: "14:00",
      tz: "Europe/Paris",
    });
    assert.equal(done.body.due_date, "2026-10-22");
    assert.equal(done.body.due_time, "14:00");
    assert.equal(done.body.tz, "America/New_York", "the worker's fallback never replaces the capture's own timezone");
  });

  test("a time without a date isn't stored, and malformed values are rejected", async () => {
    const id = "01DUEDATE000000002";
    await call("POST", "/notes", { id, raw_text: "random thought", created_at: new Date().toISOString() });
    const claim = (await claimAll()).find((c) => c.id === id);
    assert.ok(claim);
    assert.equal(claim.tz, null);

    const bad = await call("POST", `/worker/complete/${id}`, { ...organized(claim, "Thoughts"), due_date: "thursday" });
    assert.equal(bad.status, 400);
    const done = await call<Note>("POST", `/worker/complete/${id}`, { ...organized(claim, "Thoughts"), due_time: "09:00" });
    assert.equal(done.body.due_date, null);
    assert.equal(done.body.due_time, null);
  });
});

describe("morning digest", () => {
  test("lists notes due on a day, timed ones first", async () => {
    const due = await call<{ notes: Note[] }>("GET", "/notes?due=2026-10-22");
    assert.deepEqual(
      due.body.notes.map((n) => [n.id, n.due_time]),
      [["01DUEDATE000000001", "14:00"]],
    );
    assert.equal((await call("GET", "/notes?due=thursday")).status, 400);
  });

  test("one digest per day, and the latest one is what the app reads", async () => {
    assert.deepEqual((await call<{ digest: null }>("GET", "/digests/latest")).body, { digest: null });
    const day = { tz: "America/New_York", summary: "Dentist at 2 today.", note_ids: ["01DUEDATE000000001"] };
    assert.equal((await call("POST", "/worker/digests", { ...day, date: "2026-10-22" })).status, 201);
    await call("POST", "/worker/digests", { ...day, date: "2026-10-22", summary: "Rewritten after a crash." });
    await call("POST", "/worker/digests", { ...day, date: "2026-10-21", summary: "Older day." });

    const latest = await call<{ digest: { date: string; summary: string; note_ids: string[] } }>("GET", "/digests/latest");
    assert.equal(latest.body.digest.date, "2026-10-22");
    assert.equal(latest.body.digest.summary, "Rewritten after a crash.");
    assert.deepEqual(latest.body.digest.note_ids, ["01DUEDATE000000001"]);
    assert.equal((await call("POST", "/worker/digests", { ...day, date: "tomorrow" })).status, 400);
  });
});
