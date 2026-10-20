const WHISPER_SAMPLE_RATE = 16_000;
const MIN_DURATION_SEC = 0.5;

export class EmptyRecordingError extends Error {
  constructor() {
    super("Recording was empty or too short");
    this.name = "EmptyRecordingError";
  }
}

// Safari records AAC in MP4; Chrome prefers Opus in WebM. Pick the first one the browser supports.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

export interface Recording {
  audio: Float32Array;
  durationSec: number;
}

/** Records from the mic and hands back 16 kHz mono PCM, which is what Whisper expects. */
export class Recorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Not recording");
    const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
    recorder.stop();
    await stopped;
    this.release();
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.chunks = [];
    if (blob.size === 0) throw new EmptyRecordingError();
    const recording = await decodeToMono16k(await blob.arrayBuffer());
    if (recording.durationSec < MIN_DURATION_SEC) throw new EmptyRecordingError();
    return recording;
  }

  /** Stops the mic so the browser's recording indicator goes away. */
  release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }
}

async function decodeToMono16k(data: ArrayBuffer): Promise<Recording> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(data);
    const length = Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, length, WHISPER_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return { audio: rendered.getChannelData(0).slice(), durationSec: decoded.duration };
  } finally {
    await context.close();
  }
}
