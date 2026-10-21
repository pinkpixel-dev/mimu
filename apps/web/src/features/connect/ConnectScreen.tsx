import { useState, type FormEvent } from "react";
import { ApiClient, ApiError } from "../../lib/api/client.ts";
import { DEFAULT_API_URL, normalizeApiUrl, saveConnection, type Connection } from "../../lib/connection.ts";
import waving from "../../assets/mascot/1.webp";
import "./connect.css";

interface Props {
  onConnected: (connection: Connection) => void;
  initial?: Connection | null;
}

/** First-run setup: point this device at its Mimu API and enter the access key. */
export function ConnectScreen({ onConnected, initial }: Props) {
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? DEFAULT_API_URL);
  const [accessKey, setAccessKey] = useState("");
  const [state, setState] = useState<{ status: "idle" | "checking" } | { status: "error"; message: string }>({
    status: "idle",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const connection = { apiUrl: normalizeApiUrl(apiUrl), accessKey: accessKey.trim() };
    setState({ status: "checking" });
    try {
      await new ApiClient(connection).verify();
      saveConnection(connection);
      onConnected(connection);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 401
            ? "That access key didn't work."
            : `The API answered with ${error.status}.`
          : "Couldn't reach that API URL.";
      setState({ status: "error", message });
    }
  }

  const checking = state.status === "checking";

  return (
    <main className="connect">
      <img className="connect__mascot" src={waving} alt="" width={160} height={160} />
      <h1 className="connect__title">Connect Mimu</h1>
      <form className="connect__form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">API URL</span>
          <input
            className="field__input"
            type="url"
            inputMode="url"
            autoComplete="url"
            required
            placeholder="https://mimu-api.example.workers.dev"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Access key</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            required
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
          />
        </label>
        {state.status === "error" && (
          <p className="connect__error" role="alert">
            {state.message}
          </p>
        )}
        <button className="button button--primary" type="submit" disabled={checking}>
          {checking ? "Checking…" : "Connect"}
        </button>
      </form>
    </main>
  );
}
