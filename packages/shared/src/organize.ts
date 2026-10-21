import { z } from "zod";

/**
 * The structured output Gemma must return for one note.
 * The app adds frontmatter and the original transcript itself; Gemma only writes the body.
 */
export const OrganizeResult = z.object({
  title: z.string().trim().min(1).max(80),
  markdown: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(280),
  category: z.object({
    name: z.string().trim().min(1).max(40),
    is_new: z.boolean(),
  }),
  tags: z.array(z.string().trim().min(1).max(32)).max(8),
});
export type OrganizeResult = z.infer<typeof OrganizeResult>;

/** JSON Schema handed to Ollama's `format` field so decoding is constrained to this shape. */
export const organizeJsonSchema = z.toJSONSchema(OrganizeResult, { target: "draft-7" });

export const MAX_TAGS = 5;
