import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import type { Connection } from "../../lib/connection.ts";
import "./desktop.css";

interface Props {
  api: ApiClient;
  connection: Connection;
}

/** The API refreshes the worker's check-in once a minute and the worker polls every 10s, so 3 min means it's gone. */
const CONNECTED_WITHIN_MS = 3 * 60_000;
const POLL_MS = 5000;

export function desktopCommand({ apiUrl, accessKey }: Connection, showKey = true): string {
  const key = showKey ? accessKey : `${"•".repeat(8)}${accessKey.slice(-4)}`;
  return `npm install -g @pinkpixel/mimu-worker && mimu-worker setup --url ${apiUrl} --key ${key}`;
}

/** One-time pairing for the desktop worker: a copyable command with this device's URL and key filled in. */
export function DesktopView({ api, connection }: Props) {
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [showKey, setShowKey] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await api.workerStatus();
        if (!cancelled) setSeenAt(status.worker_seen_at);
      } catch {
        // Offline or the API hiccuped; keep showing the last known state.
      }
      if (!cancelled) setNow(Date.now());
    };
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api]);

  useEffect(() => {
    if (copy === "idle") return;
    const timer = setTimeout(() => setCopy("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(desktopCommand(connection));
      setCopy("copied");
    } catch {
      // Clipboard access can be blocked; reveal the key so the command can be selected by hand.
      setShowKey(true);
      setCopy("failed");
    }
  }

  const connected = seenAt ? now - Date.parse(seenAt) < CONNECTED_WITHIN_MS : false;

  return (
    <div className="desktop">
      <header className="desktop__header">
        <h1 className="desktop__title">Desktop</h1>
        <p className="desktop__status" data-state={seenAt === undefined ? "checking" : connected ? "connected" : "waiting"} role="status">
          <span className="desktop__dot" aria-hidden="true" />
          {seenAt === undefined ? "Checking…" : connected ? "Connected" : seenAt ? `Last seen ${formatAgo(now - Date.parse(seenAt))}` : "Not connected yet"}
        </p>
      </header>
      <p className="desktop__lede">Your computer organizes notes and answers questions with Gemma. Set it up once.</p>

      <ol className="desktop__steps">
        <li className="desktop__step">
          <h2 className="desktop__step-title">Install Ollama</h2>
          <a className="desktop__link" href="https://ollama.com/download" target="_blank" rel="noreferrer">
            ollama.com/download
          </a>
        </li>
        <li className="desktop__step">
          <h2 className="desktop__step-title">Run this in a terminal</h2>
          <div className="command">
            <code className="command__text">{desktopCommand(connection, showKey)}</code>
            <div className="command__actions">
              <button type="button" className="chip" aria-pressed={showKey} onClick={() => setShowKey((value) => !value)}>
                {showKey ? "Hide key" : "Show key"}
              </button>
              <button type="button" className="button button--primary command__copy" onClick={() => void copyCommand()}>
                {copy === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <p className="desktop__hint" role={copy === "failed" ? "alert" : undefined}>
            {copy === "failed"
              ? "Couldn't copy. Select the command above instead."
              : "It downloads Gemma (a few GB) once, then starts with your computer."}
          </p>
        </li>
      </ol>
    </div>
  );
}

function formatAgo(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
