import { z } from "zod";
import { DueDate } from "./note.ts";

/**
 * The morning digest: once a day (8:00 by default, on the desktop's clock) the worker has Gemma write a short
 * summary of what's due today and what you saved yesterday, and posts it here. One digest per local day.
 */
export const DigestInput = z.object({
  /** The local day this digest is for, in `tz`. */
  date: DueDate,
  tz: z.string().min(1).max(64),
  summary: z.string().trim().min(1).max(1200),
  note_ids: z.array(z.string()).max(50),
});
export type DigestInput = z.infer<typeof DigestInput>;

export const Digest = DigestInput.extend({
  created_at: z.string(),
});
export type Digest = z.infer<typeof Digest>;
