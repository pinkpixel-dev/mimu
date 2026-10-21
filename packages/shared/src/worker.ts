import { z } from "zod";

/** Notes in `failed` are retried until they hit this many attempts. */
export const MAX_ATTEMPTS = 3;

/** A claim older than this is treated as abandoned (worker crashed or went to sleep) and can be reclaimed. */
export const CLAIM_TTL_MS = 10 * 60 * 1000;

/** A failed note waits this long before it can be claimed again, so one bad note can't burn every attempt in one pass. */
export const RETRY_BACKOFF_MS = 5 * 60 * 1000;

export const ClaimInput = z.object({
  limit: z.number().int().min(1).max(20).default(5),
});
export type ClaimInput = z.infer<typeof ClaimInput>;

export const ClaimedNote = z.object({
  id: z.string(),
  raw_text: z.string(),
  claim_token: z.string(),
});
export type ClaimedNote = z.infer<typeof ClaimedNote>;

/** What the worker sends back after Gemma organizes a note. Category matching and tag normalizing happen server-side. */
export const CompleteInput = z.object({
  claim_token: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  markdown: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(280),
  category: z.string().trim().min(1).max(40),
  tags: z.array(z.string()).max(12),
  uncertain: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  model_id: z.string().min(1).max(80),
  processing_version: z.number().int().min(1),
});
/** What the worker sends (optional fields may be omitted). */
export type CompleteInput = z.input<typeof CompleteInput>;
/** What the API works with after validation (defaults applied). */
export type CompleteData = z.output<typeof CompleteInput>;

export const FailInput = z.object({
  claim_token: z.string().min(1),
  error: z.string().min(1).max(2000),
});
export type FailInput = z.infer<typeof FailInput>;

export const WorkerStatus = z.object({
  organize_requested_at: z.string().nullable(),
  pending: z.number().int(),
});
export type WorkerStatus = z.infer<typeof WorkerStatus>;
