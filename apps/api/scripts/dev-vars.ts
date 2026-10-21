import { readFile } from "node:fs/promises";

/** Parse apps/api/.dev.vars (the same file wrangler dev reads) into a plain object. */
export async function readDevVars(): Promise<Record<string, string>> {
  const text = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
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
