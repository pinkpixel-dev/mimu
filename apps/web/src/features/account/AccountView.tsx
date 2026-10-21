import type { ApiClient } from "../../lib/api/client.ts";
import type { Connection } from "../../lib/connection.ts";
import { AccountPanel } from "./AccountPanel.tsx";
import "../desktop/desktop.css";

interface Props {
  api: ApiClient;
  connection: Connection;
  onSignOut: () => void;
}

/** Demo account page: expiry, GitHub linking, sign out, delete. Only linked to when signed in with a demo account. */
export function AccountView({ api, connection, onSignOut }: Props) {
  return (
    <div className="desktop">
      <header className="desktop__header">
        <h1 className="desktop__title">Account</h1>
      </header>
      <AccountPanel api={api} connection={connection} onSignOut={onSignOut} />
    </div>
  );
}
