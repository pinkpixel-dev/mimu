import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { createApp } from "../app.ts";
import { migrate } from "../db/migrations.ts";
import { sendDueReminders } from "./reminders.ts";
import { generateVapidKeys, serializeVapidKeys } from "web-push-browser";
import type { PushConfig } from "./send.ts";
import { zonedTimeToUtc } from "./time.ts";

const KEY = "push-test-key";
let dir: string;
let db: Client;
let push: PushConfig;
let app: ReturnType<typeof createApp>;
/** A stand-in push service on localhost: records every delivery, and answers 410 for endpoints ending in /gone. */
let service: Server;
let base: string;
const received: { path: string; headers: Record<string, string | string[] | undefined>; bytes: number }[] = [];

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

/** A real browser-style subscription: a P-256 key pair and a 16-byte auth secret, pointed at the local service. */
async function subscription(path: string) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { endpoint: `https://push.test${path}`, keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) } };
}

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "mimu-push-"));
  db = createClient({ url: `file:${join(dir, "push.db")}` });
  await migrate(db);
  push = { ...(await serializeVapidKeys(await generateVapidKeys())), contact: "test@example.com" };
  app = createApp(db, KEY, { push });

  service = createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk: Buffer) => (bytes += chunk.length));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers, bytes });
      res.writeHead(req.url?.endsWith("/gone") ? 410 : 201).end();
    });
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  // Push services are HTTPS-only, so deliveries to https://push.test are sent to the local server instead.
  // Everything else (encryption, signing, headers) is the library's real output.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (!request.url.startsWith("https://push.test")) return realFetch(input, init);
    return realFetch(new Request(request.url.replace("https://push.test", base), request));
  };
  restoreFetch = () => (globalThis.fetch = realFetch);
});

let restoreFetch = () => {};

after(async () => {
  restoreFetch();
  db.close();
  service.close();
  await rm(dir, { recursive: true, force: true });
});

describe("timezones", () => {
  test("turns a local wall-clock time into the right instant, across DST", () => {
    assert.equal(zonedTimeToUtc("2026-10-22", "14:00", "America/New_York").toISOString(), "2026-10-22T18:00:00.000Z");
    // After US clocks go back on November 1.
    assert.equal(zonedTimeToUtc("2026-11-05", "14:00", "America/New_York").toISOString(), "2026-11-05T19:00:00.000Z");
    assert.equal(zonedTimeToUtc("2026-10-22", "09:30", "Asia/Kolkata").toISOString(), "2026-10-22T04:00:00.000Z");
  });
});

describe("push", () => {
  test("the app gets the public key it needs to subscribe", async () => {
    const res = await call("GET", "/push/config");
    const key = Buffer.from(res.body.public_key, "base64url");
    assert.equal(key.length, 65, "an uncompressed P-256 point");
    assert.equal(res.body.public_key, push.publicKey);
  });

  test("a test notification is encrypted and signed for each subscribed device, and dead ones are dropped", async () => {
    assert.equal((await call("POST", "/push/subscriptions", await subscription("/push/phone"))).status, 204);
    assert.equal((await call("POST", "/push/subscriptions", await subscription("/push/gone"))).status, 204);
    assert.equal((await call("POST", "/push/subscriptions", { endpoint: "not a url", keys: {} })).status, 400);

    received.length = 0;
    const res = await call("POST", "/push/test");
    assert.equal(res.body.delivered, 1);
    const phone = received.find((r) => r.path === "/push/phone");
    assert.ok(phone);
    assert.equal(phone.headers["content-encoding"], "aes128gcm");
    assert.match(String(phone.headers.authorization), /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    assert.ok(phone.bytes > 0);

    const left = await db.execute("SELECT endpoint FROM push_subscriptions");
    assert.deepEqual(left.rows.map((row) => String(row.endpoint)), ["https://push.test/push/phone"]);
  });

  test("saving the morning digest pushes it", async () => {
    received.length = 0;
    const res = await call("POST", "/worker/digests", {
      date: "2026-10-22",
      tz: "America/New_York",
      summary: "Dentist at 2.",
      note_ids: [],
    });
    assert.equal(res.status, 201);
    assert.equal(received.length, 1);
  });

  test("reminders go out once, 30 minutes before the due time, in the note's timezone", async () => {
    const insert = (id: string, date: string, time: string | null) =>
      db.execute({
        sql: `INSERT INTO notes (id, raw_text, title, status, tz, due_date, due_time, created_at, updated_at)
              VALUES (?, 'x', ?, 'processed', 'America/New_York', ?, ?, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z')`,
        args: [id, `Note ${id}`, date, time],
      });
    await insert("soon", "2026-10-22", "14:00"); // 18:00 UTC
    await insert("later", "2026-10-22", "17:00");
    await insert("allday", "2026-10-22", null);

    received.length = 0;
    // 17:40 UTC is 1:40 PM in New York: the 2:00 PM note is 20 minutes away.
    const now = new Date("2026-10-22T17:40:00Z");
    assert.deepEqual(await sendDueReminders(db, push, now), ["soon"]);
    assert.equal(received.length, 1);
    assert.deepEqual(await sendDueReminders(db, push, new Date("2026-10-22T17:45:00Z")), [], "never twice");
    // Way past its time without a reminder (say the Worker was down): skipped rather than sent late.
    assert.deepEqual(await sendDueReminders(db, push, new Date("2026-10-22T22:00:00Z")), []);
    assert.deepEqual(await sendDueReminders(db, push, new Date("2026-10-22T20:35:00Z")), ["later"]);
  });
});
