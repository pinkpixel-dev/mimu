import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api/client.ts";
import { getAuthConfig, type DemoAccount } from "../../lib/api/hosted.ts";
import type { Connection } from "../../lib/connection.ts";

interface Props {
  api: ApiClient;
  connection: Connection;
  onSignOut: () => void;
}

const LINK_RESULTS: Record<string, { text: string; error: boolean }> = {
  linked: { text: "GitHub linked.", error: false },
  taken: { text: "That GitHub account already has its own Mimu.", error: true },
};

/** Coming back from GitHub linking lands on #/account?github=linked|taken. */
function readLinkResult(): string | null {
  const result = new URLSearchParams(location.hash.split("?")[1] ?? "").get("github");
  if (result) history.replaceState(null, "", "#/account");
  return result;
}

/** Demo account details. Renders nothing on a single-user install or for the instance owner's key. */
export function AccountPanel({ api, connection, onSignOut }: Props) {
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [github, setGithub] = useState(false);
  const [notice] = useState(() => LINK_RESULTS[readLinkResult() ?? ""] ?? null);
  const [mode, setMode] = useState<"idle" | "confirm-delete" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.demoAccount(), getAuthConfig(connection.apiUrl)])
      .then(([demo, config]) => {
        if (cancelled) return;
        setAccount(demo);
        setGithub(config.github);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, connection.apiUrl]);

  if (!account) return null;

  async function linkGithub() {
    setMode("busy");
    setError(null);
    try {
      location.href = await api.githubLinkUrl();
    } catch {
      setError("Couldn't start GitHub linking. Try again.");
      setMode("idle");
    }
  }

  async function deleteAccount() {
    setMode("busy");
    setError(null);
    try {
      await api.deleteDemoAccount();
      onSignOut();
    } catch {
      setError("Couldn't delete your account. Try again.");
      setMode("idle");
    }
  }

  const busy = mode === "busy";
  const expires = new Date(account.expires_at).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  return (
    <section className="desktop__step account" aria-labelledby="account-title">
      <h2 className="account__title" id="account-title">
        Demo account
      </h2>
      <p className="desktop__hint">Deleted {expires} unless you use it before then.</p>
      {account.github_login ? (
        <p className="account__line">
          Signed in with GitHub as <strong>@{account.github_login}</strong>
        </p>
      ) : (
        github && <p className="desktop__hint">Link GitHub to sign in on other devices without your key.</p>
      )}
      {notice && (
        <p className={notice.error ? "form-error" : "account__line"} role="status">
          {notice.text}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="account__actions">
        {mode === "confirm-delete" ? (
          <>
            <span className="account__confirm">Delete your account and notes?</span>
            <button type="button" className="button button--ghost" onClick={() => setMode("idle")}>
              Keep
            </button>
            <button type="button" className="button button--danger" onClick={() => void deleteAccount()}>
              Delete
            </button>
          </>
        ) : (
          <>
            {github && !account.github_login && (
              <button type="button" className="button button--primary" onClick={() => void linkGithub()} disabled={busy}>
                Link GitHub
              </button>
            )}
            <button type="button" className="button" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
            <button type="button" className="button button--ghost" onClick={() => setMode("confirm-delete")} disabled={busy}>
              Delete account
            </button>
          </>
        )}
      </div>
    </section>
  );
}
