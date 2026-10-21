import { z } from "zod";

/**
 * Ask Mimu: a question goes into a queue through the API, the desktop worker answers it with Gemma using only
 * matching notes, and the app polls until the answer arrives.
 */
export const ASK_STATUSES = ["pending", "answering", "answered", "failed"] as const;
export const AskStatus = z.enum(ASK_STATUSES);
export type AskStatus = z.infer<typeof AskStatus>;

/** A question older than this while "answering" is treated as abandoned and can be claimed again. */
export const ASK_CLAIM_TTL_MS = 2 * 60 * 1000;

export const AskInput = z.object({
  id: z.string().min(10).max(40),
  question: z.string().trim().min(2).max(500),
});
export type AskInput = z.infer<typeof AskInput>;

export const Ask = z.object({
  id: z.string(),
  question: z.string(),
  status: AskStatus,
  answer: z.string().nullable(),
  /** Notes the answer is based on, with titles so the app can link to them. */
  notes: z.array(z.object({ id: z.string(), title: z.string() })),
  error_message: z.string().nullable(),
  created_at: z.string(),
  answered_at: z.string().nullable(),
});
export type Ask = z.infer<typeof Ask>;

export const ClaimedAsk = z.object({
  id: z.string(),
  question: z.string(),
  claim_token: z.string(),
  created_at: z.string(),
});
export type ClaimedAsk = z.infer<typeof ClaimedAsk>;

export const AskAnswerInput = z.object({
  claim_token: z.string().min(1),
  answer: z.string().trim().min(1).max(4000),
  note_ids: z.array(z.string()).max(10),
});
export type AskAnswerInput = z.infer<typeof AskAnswerInput>;

export const AskFailInput = z.object({
  claim_token: z.string().min(1),
  error: z.string().min(1).max(2000),
});
export type AskFailInput = z.infer<typeof AskFailInput>;
