import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** What `mimu-worker setup` saves. Environment variables override any of these. */
export interface SavedSettings {
  apiUrl?: string;
  accessKey?: string;
  model?: string;
  ollamaHost?: string;
}

/** ~/.config/mimu/worker.json (or $XDG_CONFIG_HOME/mimu, or %APPDATA%\mimu on Windows). */
export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.XDG_CONFIG_HOME?.trim() || (process.platform === "win32" && env.APPDATA?.trim()) || join(homedir(), ".config");
  return join(base, "mimu", "worker.json");
}

export async function readSettings(path = settingsPath()): Promise<SavedSettings> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as SavedSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Couldn't read ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

/** Merge into the saved file. Readable only by you, since it holds the access key. */
export async function saveSettings(update: SavedSettings, path = settingsPath()): Promise<SavedSettings> {
  const merged = { ...(await readSettings(path)), ...dropEmpty(update) };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  return merged;
}

function dropEmpty(settings: SavedSettings): SavedSettings {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value)) as SavedSettings;
}
