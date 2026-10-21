import { z } from "zod";

export const NOTE_STATUSES = ["pending", "processing", "processed", "failed"] as const;
export const NoteStatus = z.enum(NOTE_STATUSES);
export type NoteStatus = z.infer<typeof NoteStatus>;

/** What the phone sends when a thought is captured. The id is created client-side so retries stay idempotent. */
export const CaptureInput = z.object({
  id: z.string().min(10).max(40),
  raw_text: z.string().trim().min(1).max(20_000),
  created_at: z.iso.datetime({ offset: true }),
  /** The device's IANA timezone, so "thursday at 2" can be resolved to the right day and hour. */
  tz: z.string().min(1).max(64).optional(),
});
export type CaptureInput = z.infer<typeof CaptureInput>;

/** A day as YYYY-MM-DD, and a time of day as 24-hour HH:MM. Both are in the note's own timezone. */
export const DueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const DueTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Manual edits from the library. Any edit marks the note as user-edited so the worker never overwrites it. */
export const NotePatch = z
  .object({
    title: z.string().trim().min(1).max(80),
    markdown: z.string().trim().min(1),
    category: z.string().trim().min(1).max(40).nullable(),
    tags: z.array(z.string()).max(12),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update");
export type NotePatch = z.infer<typeof NotePatch>;

export const NoteQuery = z.object({
  /** "unsorted" means anything not processed yet: pending, processing, or failed. */
  status: z.union([NoteStatus, z.literal("unsorted")]).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  /** "all" (default): every search word must match. "any": rank notes matching any word (used by Ask Mimu). */
  match: z.enum(["all", "any"]).default("all"),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  before: z.string().optional(),
  /** Only notes due on this day (YYYY-MM-DD), earliest time first. */
  due: DueDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type NoteQuery = z.infer<typeof NoteQuery>;

export const Note = z.object({
  id: z.string(),
  raw_text: z.string(),
  title: z.string().nullable(),
  markdown: z.string().nullable(),
  summary: z.string().nullable(),
  category: z.string().nullable(),
  category_slug: z.string().nullable(),
  tags: z.array(z.string()),
  uncertain: z.array(z.string()),
  /** When the note says something should happen, if it does. Times only exist alongside a date. */
  due_date: DueDate.nullable(),
  due_time: DueTime.nullable(),
  tz: z.string().nullable(),
  status: NoteStatus,
  user_edited: z.boolean(),
  attempt_count: z.number().int(),
  error_message: z.string().nullable(),
  model_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  processed_at: z.string().nullable(),
});
export type Note = z.infer<typeof Note>;
