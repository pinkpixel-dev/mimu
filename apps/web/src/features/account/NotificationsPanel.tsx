import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import { currentSubscription, disablePush, enablePush, pushSupport } from "../../lib/push.ts";

interface Props {
  api: ApiClient;
}

type State =
  | "checking"
  | "off"
  | "on"
  | "busy"
  | "blocked"
  | "needs-home-screen"
  | "unsupported"
  /** The server has no VAPID keys, so there's nothing to turn on. */
  | "disabled";

/** Turn this device's notifications on or off: the morning digest, plus a nudge before anything with a time. */
export function NotificationsPanel({ api }: Props) {
  const [state, setState] = useState<State>("checking");
  const [test, setTest] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = pushSupport();
      if (support !== "supported") return setState(support);
      const key = await api.pushPublicKey().catch(() => null);
      if (cancelled) return;
      if (!key) return setState("disabled");
      if (Notification.permission === "denied") return setState("blocked");
      setState((await currentSubscription()) ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function turnOn() {
    setState("busy");
    setError(null);
    try {
      setState(await enablePush(api));
    } catch {
      setError("Couldn't turn on notifications. Try again.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    await disablePush(api).catch(() => undefined);
    setState("off");
    setTest("idle");
  }

  async function sendTest() {
    setTest("sending");
    try {
      setTest((await api.sendTestPush()) > 0 ? "sent" : "failed");
    } catch {
      setTest("failed");
    }
  }

  if (state === "disabled") return null;

  return (
    <section className="desktop__step" aria-labelledby="notifications-title">
      <h2 className="account__title" id="notifications-title">
        Notifications
      </h2>
      <p className="desktop__hint">A morning digest at 8, and a nudge 30 minutes before anything with a time.</p>

      {state === "needs-home-screen" && (
        <p className="account__line">On iPhone, tap Share → Add to Home Screen, then open Mimu from there to turn these on.</p>
      )}
      {state === "unsupported" && <p className="account__line">This browser can't show notifications.</p>}
      {state === "blocked" && (
        <p className="account__line">Notifications are blocked for this site. Allow them in your browser settings, then reload.</p>
      )}
      {state === "on" && (
        <p className="account__line" role="status">
          On for this device.
        </p>
      )}
      {test === "sent" && <p className="desktop__hint">Sent. It should show up in a few seconds.</p>}
      {test === "failed" && (
        <p className="form-error" role="alert">
          The test didn't go through. Try turning notifications off and on again.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {(state === "off" || state === "on" || state === "busy" || state === "checking") && (
        <div className="account__actions">
          {state === "on" ? (
            <>
              <button type="button" className="button" onClick={() => void sendTest()} disabled={test === "sending"}>
                {test === "sending" ? "Sending…" : "Send a test"}
              </button>
              <button type="button" className="button button--ghost" onClick={() => void turnOff()}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" className="button button--primary" onClick={() => void turnOn()} disabled={state !== "off"}>
              {state === "busy" ? "Turning on…" : state === "checking" ? "Checking…" : "Turn on notifications"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
