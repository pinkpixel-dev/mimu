import type { MiddlewareHandler } from "hono";

/** Bearer access-key check. Compares in constant time so the key can't be guessed byte by byte from response timing. */
export function requireAccessKey(accessKey: string): MiddlewareHandler {
  const expected = new TextEncoder().encode(accessKey);
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const provided = new TextEncoder().encode(header.startsWith("Bearer ") ? header.slice(7) : "");
    if (!accessKey || !constantTimeEqual(provided, expected)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
