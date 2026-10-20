import { useState } from "react";
import type { ModelState } from "./useTranscriber.ts";
import type { RuntimePreset } from "../../lib/transcribe/protocol.ts";
import { previousBreadcrumbs } from "../../lib/diagnostics/breadcrumbs.ts";

export interface Measurement {
  preset: RuntimePreset;
  audioSec: number;
  ms: number;
}

interface Props {
  model: ModelState;
  detected: RuntimePreset | null;
  measurements: Measurement[];
  onSwitch: (preset: RuntimePreset) => void;
  disabled: boolean;
}

/** Speech runtime details: which backend is active, load time, and per-clip speed. Used to compare WebGPU vs WASM per device. */
export function RuntimePanel({ model, detected, measurements, onSwitch, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const active = model.status === "ready" ? model.info.preset : null;
  const other: RuntimePreset = active === "webgpu" ? "wasm" : "webgpu";
  const canSwitch = model.status === "ready" && (other === "wasm" || detected === "webgpu");

  const previous = previousBreadcrumbs();
  const report = () =>
    [
      navigator.userAgent,
      location.search || "(no overrides)",
      ...(previous.length ? ["previous load:", ...previous.map((b) => `  ${b.step}`)] : []),
      model.status === "ready"
        ? `${model.info.preset} load ${fmtMs(model.info.loadMs)} isolated=${model.info.isolated} threads=${model.info.threads}`
        : model.status,
      ...measurements.map((m) => `${m.preset} audio ${m.audioSec.toFixed(1)}s → ${fmtMs(m.ms)} (${(m.ms / 1000 / m.audioSec).toFixed(2)}× realtime)`),
    ].join("\n");

  async function copy() {
    await navigator.clipboard.writeText(report());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <details className="runtime" open={previous.length > 0 && !previous.some((b) => b.step.startsWith("ready"))}>
      <summary>Speech runtime</summary>
      <dl className="runtime__grid">
        <dt>Backend</dt>
        <dd>{active ?? (model.status === "error" ? "failed" : "loading")}</dd>
        {model.status === "ready" && (
          <>
            <dt>Model load</dt>
            <dd>{fmtMs(model.info.loadMs)}</dd>
            <dt>WASM threads</dt>
            <dd>
              {model.info.threads} {model.info.isolated ? "(isolated)" : "(not isolated)"}
            </dd>
          </>
        )}
        {model.status === "error" && (
          <>
            <dt>Error</dt>
            <dd>{model.message}</dd>
          </>
        )}
      </dl>

      {previous.length > 0 && (
        <div className="runtime__previous">
          <p>Last load stopped after:</p>
          <ol className="runtime__runs">
            {previous.map((b, i) => (
              <li key={i}>{b.step}</li>
            ))}
          </ol>
        </div>
      )}

      {measurements.length > 0 && (
        <ul className="runtime__runs">
          {measurements.map((m, i) => (
            <li key={i}>
              {m.preset} · {m.audioSec.toFixed(1)}s audio → {fmtMs(m.ms)}
            </li>
          ))}
        </ul>
      )}

      <div className="runtime__actions">
        <button type="button" className="chip" onClick={() => onSwitch(other)} disabled={!canSwitch || disabled}>
          Use {other === "webgpu" ? "WebGPU" : "WASM"}
        </button>
        <button type="button" className="chip" onClick={copy}>
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>
    </details>
  );
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
