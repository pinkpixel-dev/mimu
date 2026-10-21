import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Client } from "@libsql/client";
import type { z } from "zod";
import { CaptureInput, ClaimInput, CompleteInput, FailInput, NotePatch, NoteQuery } from "@mimu/shared";
import { requireAccessKey } from "./auth.ts";
import { markdownDownload, zipDownload } from "./export.ts";
import { allNotes, createNote, deleteNote, getNote, listNotes, patchNote } from "./repo/notes.ts";
import { listCategories, listTags } from "./repo/taxonomy.ts";
import { claimNotes, completeNote, failNote, requestOrganize, workerStatus } from "./repo/worker.ts";

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  return parsed.data;
}

/** The API, independent of the Worker runtime so tests can run it against a local libSQL file. */
export function createApp(db: Client, accessKey: string) {
  const app = new Hono();

  // Auth is a bearer header, not a cookie, so allowing any origin doesn't open up CSRF.
  // Needed for the desktop worker's localhost-served PWA and the Vite dev server.
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: ["Content-Disposition"],
      maxAge: 86_400,
    }),
  );
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("*", requireAccessKey(accessKey));

  app.post("/notes", async (c) => {
    const input = await parseBody(c, CaptureInput);
    if (input instanceof Response) return input;
    const { note, created } = await createNote(db, input);
    return c.json(note, created ? 201 : 200);
  });

  app.get("/notes", async (c) => {
    const query = NoteQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "invalid_query", issues: query.error.issues }, 400);
    return c.json({ notes: await listNotes(db, query.data) });
  });

  app.get("/notes/:id", async (c) => {
    const note = await getNote(db, c.req.param("id"));
    return note ? c.json(note) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/notes/:id", async (c) => {
    const patch = await parseBody(c, NotePatch);
    if (patch instanceof Response) return patch;
    const note = await patchNote(db, c.req.param("id"), patch);
    return note ? c.json(note) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/notes/:id", async (c) =>
    (await deleteNote(db, c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
  );

  app.get("/export/notes/:file", async (c) => {
    const file = c.req.param("file");
    const note = file.endsWith(".md") ? await getNote(db, file.slice(0, -3)) : null;
    return note ? markdownDownload(note) : c.json({ error: "not_found" }, 404);
  });

  app.get("/export/all.zip", async () => zipDownload(await allNotes(db)));

  app.get("/categories", async (c) => c.json({ categories: await listCategories(db) }));
  app.get("/tags", async (c) => c.json({ tags: await listTags(db) }));

  app.post("/organize", async (c) => c.json({ organize_requested_at: await requestOrganize(db) }, 202));

  app.get("/worker/status", async (c) => c.json(await workerStatus(db)));

  app.post("/worker/claim", async (c) => {
    const input = await parseBody(c, ClaimInput);
    if (input instanceof Response) return input;
    return c.json({ notes: await claimNotes(db, input.limit) });
  });

  app.post("/worker/complete/:id", async (c) => {
    const input = await parseBody(c, CompleteInput);
    if (input instanceof Response) return input;
    const outcome = await completeNote(db, c.req.param("id"), input);
    if (outcome === "not_found") return c.json({ error: "not_found" }, 404);
    if (outcome === "stale_claim") return c.json({ error: "stale_claim" }, 409);
    return c.json(await getNote(db, c.req.param("id")));
  });

  app.post("/worker/fail/:id", async (c) => {
    const input = await parseBody(c, FailInput);
    if (input instanceof Response) return input;
    return (await failNote(db, c.req.param("id"), input)) ? c.body(null, 204) : c.json({ error: "stale_claim" }, 409);
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
