import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { WHISPER_MODEL, type RuntimePreset, type WorkerRequest, type WorkerResponse } from "./protocol.ts";

env.allowLocalModels = false;

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedPreset: RuntimePreset | null = null;

const post = (message: WorkerResponse) => self.postMessage(message);

// WebGPU runs fp32 encoder + q4 decoder well; WASM is happiest with q8 everywhere.
const PRESET_OPTIONS = {
  webgpu: { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } },
  wasm: { device: "wasm", dtype: { encoder_model: "q8", decoder_model_merged: "q8" } },
} as const;

async function load(preset: RuntimePreset, threads?: number) {
  if (asr && loadedPreset === preset) {
    post({ type: "ready", preset, loadMs: 0, isolated: self.crossOriginIsolated, threads: threadCount() });
    return;
  }
  await asr?.dispose();
  asr = null;

  const wasm = env.backends.onnx.wasm;
  if (threads !== undefined && wasm) wasm.numThreads = threads;

  const started = performance.now();
  const options = PRESET_OPTIONS[preset];
  post({ type: "stage", step: `load ${preset} threads=${threadCount()}` });
  asr = (await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
    device: options.device,
    dtype: { ...options.dtype },
    progress_callback: (info) => {
      if (info.status === "progress_total") post({ type: "progress", loaded: info.loaded, total: info.total });
      // Files finish downloading before ONNX sessions are created; if the tab dies after the last of these,
      // the crash happened during session creation.
      if (info.status === "done") post({ type: "stage", step: `downloaded ${info.file}` });
    },
  })) as AutomaticSpeechRecognitionPipeline;
  loadedPreset = preset;

  post({
    type: "ready",
    preset,
    loadMs: performance.now() - started,
    isolated: self.crossOriginIsolated,
    threads: threadCount(),
  });
}

async function transcribe(id: number, audio: Float32Array) {
  if (!asr) throw new Error("Model is not loaded");
  const started = performance.now();
  post({ type: "stage", step: `transcribe ${(audio.length / 16_000).toFixed(1)}s` });
  const output = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
  const text = (Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text).trim();
  post({ type: "result", id, text, ms: performance.now() - started });
}

function threadCount(): number {
  return env.backends.onnx.wasm?.numThreads ?? 1;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "load") await load(message.preset, message.threads);
    else await transcribe(message.id, message.audio);
  } catch (error) {
    post({
      type: "error",
      id: message.type === "transcribe" ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
