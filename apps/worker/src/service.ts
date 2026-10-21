import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const SYSTEMD_NAME = "mimu-worker.service";
const LAUNCHD_LABEL = "dev.pinkpixel.mimu-worker";

/** How the service starts the worker: this Node binary running this CLI file, both as absolute paths. */
export interface Launch {
  node: string;
  script: string;
}

export function currentLaunch(): Launch {
  return { node: process.execPath, script: realpathSync(process.argv[1] ?? "") };
}

/** npx runs packages from a cache that gets cleared, so a service pointing there would break later. */
export function isEphemeral(script: string): boolean {
  return /[\\/]_npx[\\/]/.test(script);
}

export function supportsService(platform = process.platform): boolean {
  return platform === "linux" || platform === "darwin";
}

export function systemdUnit({ node, script }: Launch): string {
  return `[Unit]
Description=Mimu worker (organizes your notes with a local model)

[Service]
ExecStart="${node}" "${script}" start
Restart=on-failure
RestartSec=15

[Install]
WantedBy=default.target
`;
}

export function launchdPlist({ node, script }: Launch, logFile: string): string {
  const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${xml(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logFile)}</string>
</dict>
</plist>
`;
}

function systemdPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "systemd", "user", SYSTEMD_NAME);
}

function launchdPaths() {
  return {
    plist: join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
    log: join(homedir(), "Library", "Logs", "mimu-worker.log"),
  };
}

/** Install (or reinstall) the worker as a per-user service that starts at login. Returns how to read its logs. */
export async function installService(launch = currentLaunch()): Promise<{ logs: string }> {
  if (process.platform === "linux") {
    const path = systemdPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, systemdUnit(launch));
    await run("systemctl", ["--user", "daemon-reload"]);
    await run("systemctl", ["--user", "enable", SYSTEMD_NAME]);
    // restart, not start, so a reinstall picks up a new config or package version.
    await run("systemctl", ["--user", "restart", SYSTEMD_NAME]);
    return { logs: "journalctl --user -u mimu-worker -f" };
  }
  if (process.platform === "darwin") {
    const { plist, log } = launchdPaths();
    const domain = `gui/${process.getuid?.() ?? 0}`;
    await mkdir(dirname(plist), { recursive: true });
    await mkdir(dirname(log), { recursive: true });
    await writeFile(plist, launchdPlist(launch, log));
    await run("launchctl", ["bootout", `${domain}/${LAUNCHD_LABEL}`]).catch(() => undefined);
    await run("launchctl", ["bootstrap", domain, plist]);
    return { logs: `tail -f "${log}"` };
  }
  throw new Error("Background services are only set up on Linux and macOS. Run `mimu-worker` in a terminal instead.");
}

export async function uninstallService(): Promise<void> {
  if (process.platform === "linux") {
    await run("systemctl", ["--user", "disable", "--now", SYSTEMD_NAME]).catch(() => undefined);
    await rm(systemdPath(), { force: true });
    await run("systemctl", ["--user", "daemon-reload"]);
    return;
  }
  if (process.platform === "darwin") {
    const { plist } = launchdPaths();
    await run("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}/${LAUNCHD_LABEL}`]).catch(() => undefined);
    await rm(plist, { force: true });
    return;
  }
  throw new Error("There's no background service to remove on this platform.");
}
