import type { SavedSettings } from "./settings-file.ts";

/**
 * Worker settings. Environment variables win (apps/worker/.env is loaded automatically in development),
 * then whatever `mimu-worker setup` saved, then defaults.
 */
export interface WorkerConfig {
  apiUrl: string;
  accessKey: string;
  ollamaHost: string;
  model: string;
  intervalMs: number;
  pollMs: number;
  askPollMs: number;
  batchSize: number;
  /** Hour (0-23, this computer's clock) when the morning digest gets written. */
  digestHour: number;
}

export const DEFAULT_MODEL = "gemma4:e4b";
export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(
      `${name} is not set. Run "mimu-worker setup --url <your Mimu URL>/api --key <access key>", ` +
        `or copy apps/worker/.env.example to apps/worker/.env when running from the repo.`,
    );
  }
  return value.trim();
}

function number(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function digestHour(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 8;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 23) throw new Error("MIMU_DIGEST_HOUR must be a whole hour from 0 to 23");
  return value;
}

export function loadConfig(saved: SavedSettings = {}, env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    apiUrl: required(env.MIMU_API_URL || saved.apiUrl, "MIMU_API_URL").replace(/\/+$/, ""),
    accessKey: required(env.MIMU_ACCESS_KEY || saved.accessKey, "MIMU_ACCESS_KEY"),
    ollamaHost: env.OLLAMA_HOST?.trim() || saved.ollamaHost || DEFAULT_OLLAMA_HOST,
    model: env.MIMU_MODEL?.trim() || saved.model || DEFAULT_MODEL,
    intervalMs: number(env, "MIMU_INTERVAL_MINUTES", 60) * 60_000,
    pollMs: number(env, "MIMU_POLL_SECONDS", 10) * 1000,
    askPollMs: number(env, "MIMU_ASK_POLL_SECONDS", 3) * 1000,
    batchSize: number(env, "MIMU_BATCH_SIZE", 5),
    digestHour: digestHour(env.MIMU_DIGEST_HOUR),
  };
}
