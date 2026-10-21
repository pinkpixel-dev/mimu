import { useEffect, useRef, useState } from "react";
import { EmptyRecordingError, Recorder } from "../../lib/audio/recorder.ts";
import type { Outbox } from "../../lib/outbox/outbox.ts";
import { useTranscriber } from "./useTranscriber.ts";
import { RuntimePanel, type Measurement } from "./RuntimePanel.tsx";
import { SyncBadge } from "./SyncBadge.tsx";
import hugging from "../../assets/mascot/5.webp";
import "./capture.css";

type Phase =
  | { name: "idle" }
  | { name: "recording" }
  | { name: "transcribing" }
  | { name: "review"; text: string; typed: boolean }
  | { name: "saving"; text: string; typed: boolean }
  | { name: "saved" }
  | { name: "error"; message: string };

const SAVED_DISPLAY_MS = 2200;

interface Props {
  outbox: Outbox;
  onReconnect: () => void;
  /** Shown on phones for demo accounts, where the sidebar (and its Account link) is hidden. */
  onAccount?: () => void;
}

export function CaptureScreen({ outbox, onReconnect, onAccount }: Props) {
  const { model, detected, load, transcribe } = useTranscriber();
  const recorderRef = useRef(new Recorder());
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const modelReady = model.status === "ready";
  const recording = phase.name === "recording";
  const busy = phase.name === "transcribing" || phase.name === "saving";
  const editing = phase.name === "review" || phase.name === "saving";

  useEffect(() => {
    if (phase.name !== "saved") return;
    const timer = setTimeout(() => setPhase({ name: "idle" }), SAVED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [phase.name]);

  async function toggleRecording() {
    if (recording) {
      setPhase({ name: "transcribing" });
      try {
        const { audio, durationSec } = await recorderRef.current.stop();
        const { text, ms } = await transcribe(audio);
        if (model.status === "ready") {
          setMeasurements((list) => [{ preset: model.info.preset, audioSec: durationSec, ms }, ...list].slice(0, 8));
        }
        setPhase(text ? { name: "review", text, typed: false } : { name: "error", message: "Didn't catch anything. Try again?" });
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
      setPhase({ name: "recording" });
    } catch (error) {
      recorderRef.current.release();
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setPhase({ name: "error", message: denied ? "Microphone access was blocked." : String(error) });
    }
  }

  async function save() {
    if (phase.name !== "review" || !phase.text.trim()) return;
    setPhase({ ...phase, name: "saving" });
    try {
      await outbox.add(phase.text);
      setPhase({ name: "saved" });
    } catch (error) {
      setPhase({ name: "error", message: `Couldn't save on this device: ${error instanceof Error ? error.message : error}` });
    }
  }

  const micLabel = recording ? "Stop recording" : "Start recording";
  const status =
    model.status === "loading"
      ? `Getting ready… ${Math.round(model.progress * 100)}%`
      : model.status === "error"
        ? "Speech model failed to load. You can still type."
        : recording
          ? "Listening…"
          : phase.name === "transcribing"
            ? "Transcribing…"
            : "Tap and say what's on your mind.";

  return (
    <main className="capture">
      <header className="capture__header">
        <span className="capture__brand">Mimu</span>
        <div className="capture__header-actions">
          <SyncBadge outbox={outbox} onReconnect={onReconnect} />
          {onAccount && (
            <button type="button" className="chip" onClick={onAccount}>
              Account
            </button>
          )}
        </div>
      </header>

      <section className="capture__stage" aria-live="polite">
        {phase.name === "saved" ? (
          <div className="saved">
            <img className="saved__mascot" src={hugging} alt="" width={140} height={140} />
            <p className="saved__text">Got it. I'll remember that.</p>
          </div>
        ) : editing ? (
          <div className="review">
            <label className="review__field">
              <span className="visually-hidden">{phase.typed ? "Your note" : "Transcript"}</span>
              <textarea
                className="review__text"
                value={phase.text}
                rows={6}
                autoFocus={phase.typed}
                placeholder="What's on your mind?"
                readOnly={phase.name === "saving"}
                onChange={(event) => setPhase({ name: "review", text: event.target.value, typed: phase.typed })}
              />
            </label>
            <div className="review__actions">
              <button type="button" className="button button--ghost" onClick={() => setPhase({ name: "idle" })} disabled={busy}>
                Discard
              </button>
              <button type="button" className="button button--primary" onClick={save} disabled={busy || !phase.text.trim()}>
                {phase.name === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
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
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
            <p className="capture__status">{status}</p>
            {phase.name === "error" && (
              <p className="capture__error" role="alert">
                {phase.message}
              </p>
            )}
            {!recording && !busy && (
              <button type="button" className="button button--ghost" onClick={() => setPhase({ name: "review", text: "", typed: true })}>
                Type instead
              </button>
            )}
          </>
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

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
