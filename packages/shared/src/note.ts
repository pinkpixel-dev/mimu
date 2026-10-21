import { z } from "zod";

export const NOTE_STATUSES = ["pending", "processing", "processed", "failed"] as const;
export const NoteStatus = z.enum(NOTE_STATUSES);
export type NoteStatus = z.infer<typeof NoteStatus>;

/** What the phone sends when a thought is captured. The id is created client-side so retries stay idempotent. */
export const CaptureInput = z.object({
  id: z.string().min(10).max(40),
  raw_text: z.string().trim().min(1).max(20_000),
  created_at: z.iso.datetime({ offset: true }),
});
export type CaptureInput = z.infer<typeof CaptureInput>;

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
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  before: z.string().optional(),
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
