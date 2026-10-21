import type { Ollama } from "ollama";
import { ApiError, type MimuApi } from "./api.ts";
import { OrganizeError, organizeNote } from "./organize/organize.ts";
import { log } from "./log.ts";

/** Bump when the prompt or output shape changes in a way worth reprocessing for later. */
export const PROCESSING_VERSION = 1;

export interface PassResult {
  organized: number;
  failed: number;
}

/**
 * One organize pass: keep claiming batches until the queue is empty.
 * Bad model output marks the note failed (the API retries it later). If Ollama itself is unreachable,
 * the pass stops without failing anything; the claims expire and the notes get picked up next time.
 */
export class OrganizeRunner {
  private running = false;

  constructor(
    private readonly api: MimuApi,
    private readonly ollama: Ollama,
    private readonly model: string,
    private readonly batchSize: number,
  ) {}

  async pass(reason: string): Promise<PassResult | null> {
    if (this.running) return null;
    this.running = true;
    const result: PassResult = { organized: 0, failed: 0 };
    try {
      const categories = await this.api.categories();
      for (;;) {
        const claims = await this.api.claim(this.batchSize);
        if (claims.length === 0) break;
        if (result.organized + result.failed === 0) log.info(`Organizing (${reason})…`);

        for (const claim of claims) {
          try {
            const { result: organized, durationMs } = await organizeNote(this.ollama, this.model, claim.raw_text, categories);
            const note = await this.api.complete(claim.id, {
              claim_token: claim.claim_token,
              title: organized.title,
              markdown: organized.markdown,
              summary: organized.summary,
              category: organized.category.name,
              tags: organized.tags,
              model_id: this.model,
              processing_version: PROCESSING_VERSION,
            });
            if (note.category && !categories.includes(note.category)) categories.push(note.category);
            result.organized++;
            log.info(`  ✓ ${note.title} → ${note.category ?? "Unsorted"} (${(durationMs / 1000).toFixed(1)}s)`);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              log.warn(`  skipped ${claim.id}: edited or reclaimed while organizing`);
            } else if (error instanceof OrganizeError) {
              result.failed++;
              log.warn(`  ✗ ${claim.id}: ${error.message}`);
              await this.api.fail(claim.id, { claim_token: claim.claim_token, error: error.message }).catch(() => {});
            } else {
              throw error;
            }
          }
        }
      }
      if (result.organized + result.failed > 0) {
        log.info(`Done: ${result.organized} organized, ${result.failed} failed`);
      }
      return result;
    } catch (error) {
      log.warn(`Organize pass stopped: ${error instanceof Error ? error.message : error}`);
      return result;
    } finally {
      this.running = false;
    }
  }
}
