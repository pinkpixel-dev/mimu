/** Random, URL-safe secret with a readable prefix, e.g. `mimu_3f9a…`. */
export function randomSecret(prefix: string, bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return `${prefix}${toHex(buffer)}`;
}

/** SHA-256 hex digest. Fine for high-entropy secrets; never use it for passwords. */
export async function sha256(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
