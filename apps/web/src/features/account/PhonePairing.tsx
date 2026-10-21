import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import { QrCode } from "./QrCode.tsx";

interface Props {
  api: ApiClient;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; link: string; expiresAt: number }
  | { status: "error" };

/** The phone opens the app at #/signin?code=…, which the connect screen swaps for its own key. */
function pairingLink(code: string): string {
  return `${location.origin}${location.pathname}#/signin?${new URLSearchParams({ code })}`;
}

/** Sign a phone in to this demo account by scanning a QR code. Codes are single use and last 5 minutes. */
export function PhonePairing({ api }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.status !== "ready") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.status]);

  async function newCode() {
    setState({ status: "loading" });
    setCopied(false);
    try {
      const { code, expires_in } = await api.pairingCode();
      setNow(Date.now());
      setState({ status: "ready", link: pairingLink(code), expiresAt: Date.now() + expires_in * 1000 });
    } catch {
      setState({ status: "error" });
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Nothing else to fall back to; the QR code is the main path.
    }
  }

  const remaining = state.status === "ready" ? Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) : 0;
  const expired = state.status === "ready" && remaining === 0;

  return (
    <section className="desktop__step pairing" aria-labelledby="pairing-title">
      <h2 className="account__title" id="pairing-title">
        Open on your phone
      </h2>

      {state.status === "ready" && !expired ? (
        <div className="pairing__body">
          <QrCode value={state.link} label="QR code that signs your phone in to this Mimu" />
          <div className="pairing__side">
            <p className="account__line">Scan with your phone's camera.</p>
            <p className="desktop__hint" role="timer" aria-live="off">
              Works once · expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </p>
            <div className="account__actions">
              <button type="button" className="button" onClick={() => void copyLink(state.link)}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <button type="button" className="button button--ghost" onClick={() => void newCode()}>
                New code
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {expired && <p className="desktop__hint">That code expired.</p>}
          {state.status === "error" && (
            <p className="form-error" role="alert">
              Couldn't make a code. Try again.
            </p>
          )}
          <div className="account__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void newCode()}
              disabled={state.status === "loading"}
            >
              {state.status === "loading" ? "Making a code…" : expired ? "New code" : "Show QR code"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
