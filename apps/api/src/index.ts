import { createClient } from "@libsql/client/web";
import { createApp } from "./app.ts";

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  MIMU_ACCESS_KEY: string;
}

export default {
  fetch(request, env) {
    // The web client talks to Turso over HTTP, so a client per request is cheap and safe in Workers.
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    return createApp(db, env.MIMU_ACCESS_KEY).fetch(request);
  },
} satisfies ExportedHandler<Env>;
