import { useRef, useState } from "react";
import { EmptyRecordingError, Recorder } from "../../lib/audio/recorder.ts";
import { useTranscriber } from "./useTranscriber.ts";
import { RuntimePanel, type Measurement } from "./RuntimePanel.tsx";
import "./capture.css";

type Phase =
  | { name: "idle" }
  | { name: "recording"; startedAt: number }
  | { name: "transcribing" }
  | { name: "review"; text: string }
  | { name: "error"; message: string };

export function CaptureScreen() {
  const { model, detected, load, transcribe } = useTranscriber();
  const recorderRef = useRef(new Recorder());
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const modelReady = model.status === "ready";
  const recording = phase.name === "recording";
  const busy = phase.name === "transcribing";

  async function toggleRecording() {
    if (recording) {
      setPhase({ name: "transcribing" });
      try {
        const { audio, durationSec } = await recorderRef.current.stop();
        const { text, ms } = await transcribe(audio);
        if (model.status === "ready") {
          setMeasurements((list) => [{ preset: model.info.preset, audioSec: durationSec, ms }, ...list].slice(0, 8));
        }
        setPhase(text ? { name: "review", text } : { name: "error", message: "Didn't catch anything. Try again?" });
      } catch (error) {
        const message =
          error instanceof EmptyRecordingError
            ? "That was a bit short. Try again?"
            : error instanceof Error
              ? error.message
              : String(error);
        setPhase({ name: "error", message });
      }
      return;
    }
    try {
      await recorderRef.current.start();
      setPhase({ name: "recording", startedAt: Date.now() });
    } catch (error) {
      recorderRef.current.release();
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setPhase({ name: "error", message: denied ? "Microphone access was blocked." : String(error) });
    }
  }

  const micLabel = recording ? "Stop recording" : "Start recording";
  const status =
    model.status === "loading"
      ? `Getting ready… ${Math.round(model.progress * 100)}%`
      : model.status === "error"
        ? "Speech model failed to load."
        : recording
          ? "Listening…"
          : busy
            ? "Transcribing…"
            : "Tap and say what's on your mind.";

  return (
    <main className="capture">
      <header className="capture__header">
        <span className="capture__brand">Mimu</span>
      </header>

      <section className="capture__stage" aria-live="polite">
        <button
          type="button"
          className="mic"
          data-state={recording ? "recording" : busy ? "busy" : "idle"}
          onClick={toggleRecording}
          disabled={!modelReady || busy}
          aria-pressed={recording}
          aria-label={micLabel}
          title={micLabel}
        >
          <MicIcon />
        </button>
        <p className="capture__status">{status}</p>

        {phase.name === "review" && (
          <label className="review">
            <span className="visually-hidden">Transcript</span>
            <textarea
              className="review__text"
              value={phase.text}
              rows={5}
              onChange={(event) => setPhase({ name: "review", text: event.target.value })}
            />
          </label>
        )}
        {phase.name === "error" && (
          <p className="capture__error" role="alert">
            {phase.message}
          </p>
        )}
      </section>

      <RuntimePanel model={model} detected={detected} measurements={measurements} onSwitch={load} disabled={recording || busy} />
    </main>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
