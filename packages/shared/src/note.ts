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

export const Note = z.object({
  id: z.string(),
  raw_text: z.string(),
  title: z.string().nullable(),
  markdown: z.string().nullable(),
  summary: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
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
