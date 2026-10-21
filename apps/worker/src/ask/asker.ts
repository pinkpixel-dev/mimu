import type { Ollama } from "ollama";
import type { ClaimedAsk, Note } from "@mimu/shared";
import { ApiError, type MimuApi } from "../api.ts";
import { log } from "../log.ts";
import { answerFromNotes } from "./answer.ts";
import { dayEnd, dayStart, planSearch } from "./plan.ts";

const MAX_NOTES = 8;

/**
 * Answers queued questions one at a time: plan a search with Gemma, pull matching notes through the API
 * (full-text, any word), then answer from those notes only.
 */
export class Asker {
  private busy = false;

  constructor(
    private readonly api: MimuApi,
    private readonly ollama: Ollama,
    private readonly model: string,
  ) {}

  /** Claim and answer one waiting question, if there is one. Safe to call on a timer. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const claim = await this.api.claimAsk();
      if (claim) await this.handle(claim);
    } catch {
      // API unreachable for a moment; the next tick tries again.
    } finally {
      this.busy = false;
    }
  }

  private async handle(claim: ClaimedAsk): Promise<void> {
    const started = performance.now();
    try {
      const notes = await this.retrieve(claim);
      const { answer, noteIds } = await answerFromNotes(this.ollama, this.model, claim.question, notes);
      await this.api.answerAsk(claim.id, { claim_token: claim.claim_token, answer, note_ids: noteIds });
      log.info(`  ? "${claim.question}" → ${noteIds.length} note(s), ${((performance.now() - started) / 1000).toFixed(1)}s`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return;
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`  couldn't answer "${claim.question}": ${message}`);
      await this.api.failAsk(claim.id, { claim_token: claim.claim_token, error: message }).catch(() => {});
    }
  }

  private async retrieve(claim: ClaimedAsk): Promise<Note[]> {
    const plan = await planSearch(this.ollama, this.model, claim.question, new Date(claim.created_at));
    const dates = {
      from: plan.after ? dayStart(plan.after) : undefined,
      to: plan.before ? dayEnd(plan.before) : undefined,
    };
    const q = plan.keywords.join(" ");
    const hasDates = Boolean(dates.from || dates.to);

    // Keywords within the date range first, then keywords anywhere, then (for "what did I save Tuesday?") the date range alone.
    const attempts = [
      ...(q && hasDates ? [{ q, match: "any" as const, ...dates }] : []),
      ...(q ? [{ q, match: "any" as const }] : []),
      ...(hasDates ? [dates] : []),
    ];
    for (const search of attempts) {
      const notes = await this.api.searchNotes({ ...search, limit: MAX_NOTES });
      if (notes.length) return notes;
    }
    return [];
  }
}
