import type { ApiClient } from "../../lib/api/client.ts";
import type { Connection } from "../../lib/connection.ts";
import { AccountPanel } from "./AccountPanel.tsx";
import { NotificationsPanel } from "./NotificationsPanel.tsx";
import { PhonePairing } from "./PhonePairing.tsx";
import "../desktop/desktop.css";

interface Props {
  api: ApiClient;
  connection: Connection;
  /** Pairing and the demo account details only exist on the hosted demo. */
  isDemo: boolean;
  onSignOut: () => void;
}

/** Notifications for everyone; on the hosted demo also phone pairing, GitHub linking, sign out, and delete. */
export function AccountView({ api, connection, isDemo, onSignOut }: Props) {
  return (
    <div className="desktop">
      <header className="desktop__header">
        <h1 className="desktop__title">Account</h1>
      </header>
      <NotificationsPanel api={api} />
      {isDemo && <PhonePairing api={api} />}
      {isDemo && <AccountPanel api={api} connection={connection} onSignOut={onSignOut} />}
    </div>
  );
}
