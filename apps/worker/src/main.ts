import { Ollama } from "ollama";
import { MimuApi } from "./api.ts";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { OrganizeRunner } from "./runner.ts";

const config = loadConfig();
const api = new MimuApi(config.apiUrl, config.accessKey);
const ollama = new Ollama({ host: config.ollamaHost });
const runner = new OrganizeRunner(api, ollama, config.model, config.batchSize);

log.info(`Mimu worker · ${config.model} · ${config.apiUrl} · every ${config.intervalMs / 60_000} min`);

try {
  const installed = (await ollama.list()).models.map((model) => model.name);
  if (!installed.includes(config.model)) log.warn(`${config.model} isn't pulled yet. Run: ollama pull ${config.model}`);
} catch {
  log.warn(`Can't reach Ollama at ${config.ollamaHost}. Notes will wait until it's running.`);
}

// Remember the last "Organize now" request we've seen so a stale one doesn't trigger a pass on startup.
let lastRequest: string | null = null;
try {
  lastRequest = (await api.status()).organize_requested_at;
} catch (error) {
  log.warn(`Can't reach the API yet: ${error instanceof Error ? error.message : error}`);
}

await runner.pass("startup");

setInterval(() => void runner.pass("scheduled"), config.intervalMs);

setInterval(async () => {
  try {
    const { organize_requested_at: requested } = await api.status();
    if (requested && requested !== lastRequest) {
      lastRequest = requested;
      await runner.pass("organize now");
    }
  } catch {
    // The API being briefly unreachable is normal (laptop waking up, flaky Wi-Fi); try again next poll.
  }
}, config.pollMs);

process.on("SIGINT", () => {
  log.info("Stopping");
  process.exit(0);
});
