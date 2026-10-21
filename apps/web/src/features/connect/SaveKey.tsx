import { useState } from "react";
import type { Connection } from "../../lib/connection.ts";
import holdingNotes from "../../assets/mascot/3.webp";

interface Props {
  connection: Connection;
  onContinue: () => void;
}

/** Shown once after a demo sign-up: the key is the account, so give people a chance to keep it. */
export function SaveKey({ connection, onContinue }: Props) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(connection.accessKey);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <main className="connect">
      <img className="connect__mascot" src={holdingNotes} alt="" width={160} height={160} />
      <h1 className="connect__title">Your Mimu is ready</h1>
      <div className="connect__form">
        <p className="connect__note">This key is your account. Save it to sign in on another device.</p>
        <code className="connect__key">{connection.accessKey}</code>
        <button type="button" className="button" onClick={() => void copyKey()}>
          {copy === "copied" ? "Copied" : "Copy key"}
        </button>
        {copy === "failed" && (
          <p className="connect__error" role="alert">
            Couldn't copy. Select the key above instead.
          </p>
        )}
        <button type="button" className="button button--primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </main>
  );
}
