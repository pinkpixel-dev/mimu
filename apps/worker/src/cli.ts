#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Ollama } from "ollama";
import pkg from "../package.json" with { type: "json" };
import { ApiError, MimuApi } from "./api.ts";
import { DEFAULT_MODEL, DEFAULT_OLLAMA_HOST, loadConfig } from "./config.ts";
import { startWorker } from "./main.ts";
import { currentLaunch, installService, isEphemeral, supportsService, uninstallService } from "./service.ts";
import { readSettings, saveSettings, settingsPath } from "./settings-file.ts";

const HELP = `mimu-worker ${pkg.version}
Organizes your Mimu notes and answers Ask Mimu with a local model through Ollama.

Usage
  mimu-worker setup --url <url> --key <key>   Save your connection, pull the model, start in the background
  mimu-worker                                 Run in this terminal
  mimu-worker install-service                 Start automatically when you log in (Linux, macOS)
  mimu-worker uninstall-service               Stop starting automatically

Setup options
  --url <url>        Your Mimu API URL, ending in /api
  --key <key>        Your Mimu access key
  --model <name>     Ollama model (default ${DEFAULT_MODEL})
  --no-service       Don't install the background service

Settings live in ${settingsPath()}.
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    key: { type: "string" },
    model: { type: "string" },
    "no-service": { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

const say = (message = "") => console.log(message);
const done = (message: string) => say(`✓ ${message}`);

async function setup(): Promise<void> {
  const saved = await readSettings();
  const apiUrl = (values.url ?? saved.apiUrl)?.trim().replace(/\/+$/, "");
  const accessKey = (values.key ?? saved.accessKey)?.trim();
  if (!apiUrl || !accessKey) throw new Error("Pass --url and --key. Mimu's Desktop page has the full command to copy.");

  try {
    await new MimuApi(apiUrl, accessKey).status();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error("Mimu rejected that access key.");
    throw new Error(`Couldn't reach Mimu at ${apiUrl}: ${error instanceof Error ? error.message : error}`);
  }
  const settings = await saveSettings({ apiUrl, accessKey, model: values.model });
  done(`Connected to ${apiUrl}`);

  const model = settings.model ?? DEFAULT_MODEL;
  const ollama = new Ollama({ host: settings.ollamaHost ?? DEFAULT_OLLAMA_HOST });
  let installed: string[];
  try {
    installed = (await ollama.list()).models.map((m) => m.name);
  } catch {
    throw new Error("Ollama isn't running. Install it from https://ollama.com/download, then run this command again.");
  }
  if (installed.includes(model)) done(`${model} is ready`);
  else await pull(ollama, model);

  if (values["no-service"]) return void say("\nStart it any time with: mimu-worker");
  await service();
}

async function pull(ollama: Ollama, model: string): Promise<void> {
  say(`Downloading ${model}. This is a one-time download of a few GB.`);
  let lastStatus = "";
  for await (const progress of await ollama.pull({ model, stream: true })) {
    const percent = progress.total ? ` ${Math.floor((progress.completed / progress.total) * 100)}%` : "";
    // A terminal gets one line that updates in place; logs get a line per stage.
    if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K  ${progress.status}${percent}`);
    else if (progress.status !== lastStatus) say(`  ${progress.status}`);
    lastStatus = progress.status;
  }
  if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
  done(`${model} is ready`);
}

async function service(): Promise<void> {
  if (!supportsService()) return void say("\nStart it with: mimu-worker (keep the terminal open)");
  const launch = currentLaunch();
  if (isEphemeral(launch.script) || launch.script.endsWith(".ts")) {
    say("\nSkipping the background service, since this copy of mimu-worker isn't installed permanently.");
    say(`Install it with "npm install -g ${pkg.name}" and run setup again, or start it now with: mimu-worker`);
    return;
  }
  const { logs } = await installService(launch);
  done("Running in the background, and it starts again when you log in");
  say(`\nWatch it work: ${logs}`);
}

async function main(): Promise<void> {
  if (values.version) return say(pkg.version);
  if (values.help) return say(HELP);
  const command = positionals[0] ?? "start";
  switch (command) {
    case "start":
      return startWorker(loadConfig(await readSettings()));
    case "setup":
      return setup();
    case "install-service":
      return service();
    case "uninstall-service":
      await uninstallService();
      return done("Background service removed. Your settings are still saved.");
    default:
      say(HELP);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
