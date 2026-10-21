import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "./lib/api/client.ts";
import { clearConnection, loadConnection, type Connection } from "./lib/connection.ts";
import { Outbox } from "./lib/outbox/outbox.ts";
import { ConnectScreen } from "./features/connect/ConnectScreen.tsx";
import { Shell } from "./features/shell/Shell.tsx";

export function App() {
  const [connection, setConnection] = useState<Connection | null>(() => loadConnection());
  const api = useMemo(() => (connection ? new ApiClient(connection) : null), [connection]);
  const outbox = useMemo(() => (api ? new Outbox(api) : null), [api]);

  // Retry queued captures whenever there's a decent chance the network is back.
  useEffect(() => {
    if (!outbox) return;
    const flush = () => void outbox.flush();
    const onVisible = () => document.visibilityState === "visible" && flush();
    flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [outbox]);

  if (!connection || !api || !outbox) return <ConnectScreen onConnected={setConnection} />;

  return (
    <Shell
      api={api}
      connection={connection}
      outbox={outbox}
      onReconnect={() => {
        clearConnection();
        setConnection(null);
      }}
    />
  );
}
