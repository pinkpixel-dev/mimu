import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "./lib/api/client.ts";
import { clearConnection, loadConnection, type Connection } from "./lib/connection.ts";
import { Outbox } from "./lib/outbox/outbox.ts";
import { ConnectScreen } from "./features/connect/ConnectScreen.tsx";
import { CaptureScreen } from "./features/capture/CaptureScreen.tsx";

export function App() {
  const [connection, setConnection] = useState<Connection | null>(() => loadConnection());
  const outbox = useMemo(() => (connection ? new Outbox(new ApiClient(connection)) : null), [connection]);

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

  if (!connection || !outbox) return <ConnectScreen onConnected={setConnection} />;

  return (
    <CaptureScreen
      outbox={outbox}
      onReconnect={() => {
        clearConnection();
        setConnection(null);
      }}
    />
  );
}
