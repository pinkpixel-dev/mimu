import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
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

  test("organize requests show up in worker status", async () => {
    await capture("pending one");
    const requested = await call<{ organize_requested_at: string }>("POST", "/organize");
    const status = await call<{ organize_requested_at: string; pending: number }>("GET", "/worker/status");
    assert.equal(status.body.organize_requested_at, requested.body.organize_requested_at);
    assert.ok(status.body.pending >= 1);
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
  });

  test("deletes notes and their tags", async () => {
    const note = await capture("throwaway");
    assert.equal((await call("DELETE", `/notes/${note.id}`)).status, 204);
    assert.equal((await call("GET", `/notes/${note.id}`)).status, 404);
    assert.equal((await call("DELETE", `/notes/${note.id}`)).status, 404);
  });
});
