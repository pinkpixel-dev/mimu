import { useCallback, useEffect, useRef, useState } from "react";
import { Transcriber, detectPreset, type ReadyInfo } from "../../lib/transcribe/transcriber.ts";
import type { RuntimePreset } from "../../lib/transcribe/protocol.ts";
import { crumb } from "../../lib/diagnostics/breadcrumbs.ts";

const DEFAULT_PRESET: RuntimePreset = "wasm";

export type ModelState =
  | { status: "loading"; progress: number }
  | { status: "ready"; info: ReadyInfo }
  | { status: "error"; message: string };

/** `?runtime=wasm|webgpu` and `?threads=N` force a speech runtime, for testing devices we can't debug directly. */
function readOverrides(): { preset?: RuntimePreset; threads?: number } {
  const params = new URLSearchParams(location.search);
  const runtime = params.get("runtime");
  const threads = Number.parseInt(params.get("threads") ?? "", 10);
  return {
    preset: runtime === "wasm" || runtime === "webgpu" ? runtime : undefined,
    threads: Number.isFinite(threads) && threads > 0 ? threads : undefined,
  };
}

/** Owns the single Whisper worker and loads the model as soon as the screen mounts. */
export function useTranscriber() {
  const transcriberRef = useRef<Transcriber | null>(null);
  const threadsRef = useRef<number | undefined>(undefined);
  const [model, setModel] = useState<ModelState>({ status: "loading", progress: 0 });
  const [detected, setDetected] = useState<RuntimePreset | null>(null);

  const load = useCallback(async (preset: RuntimePreset) => {
    const transcriber = transcriberRef.current;
    if (!transcriber) return;
    setModel({ status: "loading", progress: 0 });
    try {
      const info = await transcriber.load(preset, threadsRef.current);
      crumb(`ready ${info.preset} in ${Math.round(info.loadMs)}ms`);
      setModel({ status: "ready", info });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      crumb(`load failed: ${message}`);
      setModel({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    const transcriber = new Transcriber((progress) =>
      setModel((current) => (current.status === "loading" ? { status: "loading", progress } : current)),
    );
    transcriberRef.current = transcriber;
    const overrides = readOverrides();
    threadsRef.current = overrides.threads;
    crumb(`boot isolated=${self.crossOriginIsolated}${location.search}`);
    let cancelled = false;
    detectPreset().then((preset) => {
      if (cancelled) return;
      setDetected(preset);
      // WASM is the default everywhere: WebGPU crashed iOS Safari during session setup, and on desktop it
      // wasn't meaningfully faster for whisper-tiny. WebGPU stays available as an opt-in override.
      const chosen = overrides.preset ?? DEFAULT_PRESET;
      crumb(`detected ${preset}, using ${chosen}`);
      void load(chosen);
    });
    return () => {
      cancelled = true;
      transcriber.terminate();
      transcriberRef.current = null;
    };
  }, [load]);

  const transcribe = useCallback((audio: Float32Array) => {
    if (!transcriberRef.current) return Promise.reject(new Error("Transcriber is not running"));
    return transcriberRef.current.transcribe(audio);
  }, []);

  return { model, detected, load, transcribe };
}
