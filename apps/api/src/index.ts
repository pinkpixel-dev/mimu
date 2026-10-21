import { createClient } from "@libsql/client/web";
import { createApp } from "./app.ts";

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  MIMU_ACCESS_KEY: string;
}

const API_PREFIX = "/api";

export default {
  fetch(request, env) {
    // Static assets (the PWA) are served before this runs; only /api/* reaches the Worker (see wrangler.jsonc).
    const url = new URL(request.url);
    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
      return new Response("Not found", { status: 404 });
    }
    url.pathname = url.pathname.slice(API_PREFIX.length) || "/";

    // The web client talks to Turso over HTTP, so a client per request is cheap and safe in Workers.
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    return createApp(db, env.MIMU_ACCESS_KEY).fetch(new Request(url, request));
  },
} satisfies ExportedHandler<Env>;
