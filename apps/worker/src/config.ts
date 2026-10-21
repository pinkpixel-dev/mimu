/** Worker settings, read from the environment (apps/worker/.env is loaded automatically when present). */
export interface WorkerConfig {
  apiUrl: string;
  accessKey: string;
  ollamaHost: string;
  model: string;
  intervalMs: number;
  pollMs: number;
  askPollMs: number;
  batchSize: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Copy apps/worker/.env.example to apps/worker/.env and fill it in.`);
  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

export function loadConfig(): WorkerConfig {
  return {
    apiUrl: required("MIMU_API_URL").replace(/\/+$/, ""),
    accessKey: required("MIMU_ACCESS_KEY"),
    ollamaHost: process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434",
    model: process.env.MIMU_MODEL?.trim() || "gemma4:e4b",
    intervalMs: number("MIMU_INTERVAL_MINUTES", 60) * 60_000,
    pollMs: number("MIMU_POLL_SECONDS", 60) * 1000,
    askPollMs: number("MIMU_ASK_POLL_SECONDS", 3) * 1000,
    batchSize: number("MIMU_BATCH_SIZE", 5),
  };
}
