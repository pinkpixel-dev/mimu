/**
 * One-command setup for your own Mimu: database, access key, migrations, and the Cloudflare deploy.
 *
 *   pnpm quickstart
 *
 * Safe to run again. It reuses what's already in apps/api/.dev.vars and redeploys.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { migrate } from "../src/db/migrations.ts";
import { readDevVars, writeDevVars } from "./dev-vars.ts";

const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const rl = createInterface({ input: stdin, output: stdout });

const say = (message = "") => console.log(message);
const done = (message: string) => say(`✓ ${message}`);
const step = (n: number, title: string) => say(`\n${n}/4  ${title}`);

async function ask(question: string, valid: (answer: string) => boolean = (a) => a.length > 0): Promise<string> {
  for (;;) {
    const answer = (await rl.question(`    ${question} `)).trim();
    if (valid(answer)) return answer;
  }
}

async function confirm(question: string): Promise<boolean> {
  return !/^n/i.test((await rl.question(`    ${question} (Y/n) `)).trim());
}

/** Run a command in apps/api. With `capture`, output is still shown live and also returned. */
function sh(command: string, args: string[], { capture = false, quiet = false } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: API_DIR,
      shell: process.platform === "win32",
      stdio: capture || quiet ? ["inherit", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    const collect = (chunk: Buffer, sink: NodeJS.WriteStream) => {
      output += chunk.toString();
      if (!quiet) sink.write(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(chunk, process.stdout));
    child.stderr?.on("data", (chunk: Buffer) => collect(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(output);
      if (quiet) process.stderr.write(output);
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function database(): Promise<{ accessKey: string }> {
  step(1, "Database");
  const existing = await readDevVars().catch(() => ({}) as Record<string, string>);
  let url = existing.TURSO_DATABASE_URL;
  let token = existing.TURSO_AUTH_TOKEN;

  if (!(url && token && (await confirm(`Use the Turso database already in apps/api/.dev.vars (${url})?`)))) {
    say("    Create a free database at https://app.turso.tech, then copy its URL and an auth token.");
    url = await ask("Database URL (libsql://…):", (a) => /^(libsql|https):\/\//.test(a));
    token = await ask("Auth token:");
  }
  const accessKey = existing.MIMU_ACCESS_KEY || randomBytes(32).toString("hex");
  const values = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token, MIMU_ACCESS_KEY: accessKey };
  if (Object.entries(values).some(([key, value]) => existing[key] !== value)) await writeDevVars(values);

  const db = createClient({ url, authToken: token });
  try {
    const ran = await migrate(db);
    done(ran.length ? `Database ready (applied migrations ${ran.join(", ")})` : "Database ready");
  } finally {
    db.close();
  }
  return { accessKey };
}

async function build(): Promise<void> {
  step(2, "Build");
  await sh("pnpm", ["--filter", "@mimu/web", "build"], { quiet: true });
  done("Web app built");
}

async function deploy(): Promise<string> {
  step(3, "Cloudflare");
  const whoami = await sh("pnpm", ["exec", "wrangler", "whoami"], { quiet: true }).catch(() => "not authenticated");
  if (/not authenticated/i.test(whoami)) {
    say("    Opening your browser to log in to Cloudflare…");
    await sh("pnpm", ["exec", "wrangler", "login"]);
  }
  // --secrets-file uploads the three secrets alongside the code, so there's no separate `secret put` round.
  const output = await sh("pnpm", ["exec", "wrangler", "deploy", "--secrets-file", ".dev.vars"], { capture: true });
  const url = output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
  if (url) return url;
  return ask("Couldn't spot your Worker URL in that output. Paste it here:", (a) => /^https:\/\//.test(a));
}

async function main(): Promise<void> {
  say("Mimu quickstart");
  const { accessKey } = await database();
  await build();
  const appUrl = (await deploy()).replace(/\/+$/, "");
  done("Deployed");

  step(4, "You're set");
  say(`
    Open on your phone   ${appUrl}
    Access key           ${accessKey}

    On the computer that will run Gemma (this one is fine), install Ollama
    from https://ollama.com/download, then run:

    npm install -g @pinkpixel/mimu-worker && mimu-worker setup --url ${appUrl}/api --key ${accessKey}

    The same command is on the Desktop page in the app. Your key is saved in apps/api/.dev.vars.`);
}

try {
  await main();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
