import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api/client.ts";
import {
  createDemoAccount,
  exchangeLoginCode,
  getAuthConfig,
  githubSignInUrl,
  type AuthConfig,
} from "../../lib/api/hosted.ts";
import { DEFAULT_API_URL, saveConnection, type Connection } from "../../lib/connection.ts";
import waving from "../../assets/mascot/1.webp";
import { KeyForm } from "./KeyForm.tsx";
import { SaveKey } from "./SaveKey.tsx";
import "./connect.css";

interface Props {
  onConnected: (connection: Connection) => void;
}

type View =
  | { name: "loading" }
  | { name: "start"; config: AuthConfig }
  | { name: "key-form" }
  | { name: "save-key"; connection: Connection };

const SIGNIN_ERRORS: Record<string, string> = {
  expired: "That sign-in link was already used or has expired.",
  github: "GitHub sign-in didn't go through. Try again.",
  full: "The demo is full right now.",
};

/** GitHub sign-in comes back as #/signin?code=… or #/signin?error=… */
function readSignin(): { code?: string; error?: string } | null {
  const match = location.hash.match(/^#\/signin\?(.*)$/);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  return { code: params.get("code") ?? undefined, error: params.get("error") ?? undefined };
}

/**
 * First run. On the hosted demo: start a demo account, continue with GitHub, or use an existing key.
 * On a single-user install: just the API URL and key form.
 */
export function ConnectScreen({ onConnected }: Props) {
  const [view, setView] = useState<View>({ name: "loading" });
  const [busy, setBusy] = useState<"demo" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = (connection: Connection) => {
    saveConnection(connection);
    onConnected(connection);
  };

  useEffect(() => {
    const controller = new AbortController();
    const signin = readSignin();
    if (signin) history.replaceState(null, "", "#/");

    void (async () => {
      if (signin?.code) {
        setBusy("signin");
        try {
          const accessKey = await exchangeLoginCode(DEFAULT_API_URL, signin.code);
          finish({ apiUrl: DEFAULT_API_URL, accessKey });
          return;
        } catch {
          setError(SIGNIN_ERRORS.expired!);
        } finally {
          setBusy(null);
        }
      } else if (signin?.error) {
        setError(SIGNIN_ERRORS[signin.error] ?? SIGNIN_ERRORS.github!);
      }

      if (!DEFAULT_API_URL) return setView({ name: "key-form" });
      const config = await getAuthConfig(DEFAULT_API_URL, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      setView(config?.hosted ? { name: "start", config } : { name: "key-form" });
    })();
    return () => controller.abort();
    // Runs once per mount; `finish` only closes over stable props.
  }, []);

  async function startDemo() {
    setBusy("demo");
    setError(null);
    try {
      const accessKey = await createDemoAccount(DEFAULT_API_URL);
      setView({ name: "save-key", connection: { apiUrl: DEFAULT_API_URL, accessKey } });
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.message === "demo_full"
          ? SIGNIN_ERRORS.full!
          : "Couldn't create your demo. Try again in a moment.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (view.name === "save-key") return <SaveKey connection={view.connection} onContinue={() => finish(view.connection)} />;

  return (
    <main className="connect">
      <img className="connect__mascot" src={waving} alt="" width={160} height={160} />
      <h1 className="connect__title">{view.name === "start" ? "Try Mimu" : "Connect Mimu"}</h1>

      {error && (
        <p className="connect__error" role="alert">
          {error}
        </p>
      )}

      {view.name === "loading" && (
        <p className="connect__note" role="status">
          {busy === "signin" ? "Signing in…" : "Loading…"}
        </p>
      )}

      {view.name === "start" && (
        <div className="connect__form">
          {view.config.open ? (
            <button type="button" className="button button--primary" onClick={() => void startDemo()} disabled={busy !== null}>
              {busy === "demo" ? "Setting up your Mimu…" : "Start a demo"}
            </button>
          ) : (
            <p className="connect__note">The demo is full right now.</p>
          )}
          {view.config.github && (
            <a className="button" href={githubSignInUrl(DEFAULT_API_URL)}>
              Continue with GitHub
            </a>
          )}
          <button type="button" className="link-button connect__alt" onClick={() => setView({ name: "key-form" })}>
            I have a key
          </button>
          <p className="connect__note">Demo accounts are deleted after 30 days without use.</p>
        </div>
      )}

      {view.name === "key-form" && <KeyForm initialApiUrl={DEFAULT_API_URL} onConnected={finish} />}
    </main>
  );
}
