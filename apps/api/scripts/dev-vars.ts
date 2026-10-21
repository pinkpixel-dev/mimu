import { readFile, writeFile } from "node:fs/promises";

export const DEV_VARS_URL = new URL("../.dev.vars", import.meta.url);

/** Parse apps/api/.dev.vars (the same file wrangler dev reads) into a plain object. */
export async function readDevVars(): Promise<Record<string, string>> {
  const text = await readFile(DEV_VARS_URL, "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

/** Merge values into apps/api/.dev.vars, keeping any other keys already there. Readable only by you. */
export async function writeDevVars(values: Record<string, string>): Promise<void> {
  const current = await readDevVars().catch(() => ({}));
  const merged = { ...current, ...values };
  const text = Object.entries(merged)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await writeFile(DEV_VARS_URL, `${text}\n`, { mode: 0o600 });
}
