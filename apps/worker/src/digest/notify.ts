import { execFile } from "node:child_process";

/**
 * Best-effort desktop notification. Linux uses notify-send, macOS uses osascript. Anywhere else, or if the
 * command is missing or there's no desktop session (a headless box), it quietly does nothing.
 */
export function notifyDesktop(title: string, body: string): Promise<boolean> {
  const command =
    process.platform === "linux"
      ? { file: "notify-send", args: ["--app-name=Mimu", title, body] }
      : process.platform === "darwin"
        ? {
            file: "osascript",
            args: ["-e", `display notification ${appleString(body)} with title ${appleString(title)}`],
          }
        : null;
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(command.file, command.args, { timeout: 5000 }, (error) => resolve(!error));
  });
}

/** AppleScript string literal: wrap in quotes, escape backslashes and quotes. */
function appleString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
