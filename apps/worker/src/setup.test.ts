import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MODEL, loadConfig } from "./config.ts";
import { isEphemeral, launchdPlist, systemdUnit } from "./service.ts";
import { readSettings, saveSettings, settingsPath } from "./settings-file.ts";

test("environment variables win over saved settings, which win over defaults", () => {
  const saved = { apiUrl: "https://saved.example/api/", accessKey: "saved-key", model: "gemma4:12b" };
  const fromFile = loadConfig(saved, {});
  assert.equal(fromFile.apiUrl, "https://saved.example/api");
  assert.equal(fromFile.accessKey, "saved-key");
  assert.equal(fromFile.model, "gemma4:12b");

  const fromEnv = loadConfig(saved, { MIMU_API_URL: "http://127.0.0.1:8788", MIMU_MODEL: "gemma4:e2b" });
  assert.equal(fromEnv.apiUrl, "http://127.0.0.1:8788");
  assert.equal(fromEnv.accessKey, "saved-key");
  assert.equal(fromEnv.model, "gemma4:e2b");

  assert.equal(loadConfig({ apiUrl: "https://x/api", accessKey: "k" }, {}).model, DEFAULT_MODEL);
  assert.throws(() => loadConfig({}, {}), /mimu-worker setup/);
});

test("saved settings merge, skip empty values, and stay private", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mimu-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "mimu", "worker.json");

  assert.deepEqual(await readSettings(path), {});
  await saveSettings({ apiUrl: "https://a/api", accessKey: "one", model: "gemma4:12b" }, path);
  await saveSettings({ accessKey: "two", model: undefined }, path);
  assert.deepEqual(await readSettings(path), { apiUrl: "https://a/api", accessKey: "two", model: "gemma4:12b" });
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.ok((await readFile(path, "utf8")).endsWith("\n"));
});

test("settings follow XDG_CONFIG_HOME when it's set", () => {
  assert.equal(settingsPath({ XDG_CONFIG_HOME: "/tmp/cfg" }), join("/tmp/cfg", "mimu", "worker.json"));
});

test("service files run the installed CLI with absolute paths", () => {
  const launch = { node: "/usr/bin/node", script: "/usr/lib/node_modules/@pinkpixel/mimu-worker/dist/cli.js" };
  assert.match(systemdUnit(launch), /^ExecStart="\/usr\/bin\/node" "\/usr\/lib\/node_modules\/@pinkpixel\/mimu-worker\/dist\/cli\.js" start$/m);
  assert.match(systemdUnit(launch), /^WantedBy=default\.target$/m);

  const plist = launchdPlist({ node: "/opt/node", script: "/a&b/cli.js" }, "/Users/me/Library/Logs/mimu-worker.log");
  assert.match(plist, /<string>\/a&amp;b\/cli\.js<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
});

test("npx cache paths are treated as temporary", () => {
  assert.equal(isEphemeral("/home/me/.npm/_npx/3f2a/node_modules/@pinkpixel/mimu-worker/dist/cli.js"), true);
  assert.equal(isEphemeral("C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\3f2a\\cli.js"), true);
  assert.equal(isEphemeral("/usr/lib/node_modules/@pinkpixel/mimu-worker/dist/cli.js"), false);
});
