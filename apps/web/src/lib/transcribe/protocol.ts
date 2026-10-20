/** Messages between the UI thread and the Whisper Web Worker. */

export const WHISPER_MODEL = "onnx-community/whisper-tiny.en";

export type RuntimePreset = "webgpu" | "wasm";

export type WorkerRequest =
  | { type: "load"; preset: RuntimePreset; threads?: number }
  | { type: "transcribe"; id: number; audio: Float32Array };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "stage"; step: string }
  | { type: "ready"; preset: RuntimePreset; loadMs: number; isolated: boolean; threads: number }
  | { type: "result"; id: number; text: string; ms: number }
  | { type: "error"; id?: number; message: string };
