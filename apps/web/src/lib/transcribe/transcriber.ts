import { crumb } from "../diagnostics/breadcrumbs.ts";
import type { RuntimePreset, WorkerRequest, WorkerResponse } from "./protocol.ts";

export interface ReadyInfo {
  preset: RuntimePreset;
  loadMs: number;
  isolated: boolean;
  threads: number;
}

type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };

/** WebGPU only counts when an adapter actually comes back; navigator.gpu existing is not enough. */
export async function detectPreset(): Promise<RuntimePreset> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (!gpu) return "wasm";
  try {
    return (await gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

/** Thin promise wrapper around the Whisper Web Worker. One instance per app. */
export class Transcriber {
  private worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: { text: string; ms: number }) => void; reject: (e: Error) => void }>();
  private loading: { resolve: (r: ReadyInfo) => void; reject: (e: Error) => void } | null = null;

  constructor(private onProgress: (fraction: number) => void = () => {}) {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
  }

  load(preset: RuntimePreset, threads?: number): Promise<ReadyInfo> {
    return new Promise((resolve, reject) => {
      this.loading = { resolve, reject };
      this.send(threads === undefined ? { type: "load", preset } : { type: "load", preset, threads });
    });
  }

  transcribe(audio: Float32Array): Promise<{ text: string; ms: number }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "transcribe", id, audio } satisfies WorkerRequest, [audio.buffer]);
    });
  }

  terminate(): void {
    this.worker.terminate();
    const error = new Error("Transcriber stopped");
    this.loading?.reject(error);
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.loading = null;
  }

  private send(message: WorkerRequest) {
    this.worker.postMessage(message);
  }

  private handle(message: WorkerResponse) {
    switch (message.type) {
      case "progress":
        if (message.total > 0) this.onProgress(message.loaded / message.total);
        break;
      case "stage":
        crumb(message.step);
        break;
      case "ready": {
        const { type: _, ...info } = message;
        this.loading?.resolve(info);
        this.loading = null;
        break;
      }
      case "result":
        this.pending.get(message.id)?.resolve({ text: message.text, ms: message.ms });
        this.pending.delete(message.id);
        break;
      case "error": {
        const error = new Error(message.message);
        if (message.id !== undefined) {
          this.pending.get(message.id)?.reject(error);
          this.pending.delete(message.id);
        } else {
          this.loading?.reject(error);
          this.loading = null;
        }
      }
    }
  }
}
