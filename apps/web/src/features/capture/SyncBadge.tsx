import { useEffect, useState } from "react";
import type { Outbox, SyncState } from "../../lib/outbox/outbox.ts";

/** Quiet header status: only shows up when something is waiting or wrong. */
export function SyncBadge({ outbox, onReconnect }: { outbox: Outbox; onReconnect: () => void }) {
  const [state, setState] = useState<SyncState>({ status: "idle", pending: 0 });
  useEffect(() => outbox.subscribe(setState), [outbox]);

  if (state.status === "unauthorized") {
    return (
      <button type="button" className="sync sync--warn" onClick={onReconnect} title="Enter the access key again">
        Key rejected · Reconnect
      </button>
    );
  }
  if (state.pending === 0) return null;
  const label =
    state.status === "syncing" ? `Syncing ${state.pending}…` : `${state.pending} waiting to sync`;
  return (
    <button
      type="button"
      className="sync"
      onClick={() => void outbox.flush()}
      title="Saved on this device. Tap to retry the upload."
    >
      {label}
    </button>
  );
}
