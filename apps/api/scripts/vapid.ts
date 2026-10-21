/**
 * Generate the VAPID keys that push notifications are signed with, and save them to apps/api/.dev.vars.
 * The private key is never printed. Deploy afterwards (`pnpm quickstart`) so the Worker gets them as secrets.
 *
 *   pnpm --filter @mimu/api vapid
 *
 * Running it again keeps existing keys, because new keys would break every device that already subscribed.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { generateVapidKeys, serializeVapidKeys } from "web-push-browser";
import { readDevVars, writeDevVars } from "./dev-vars.ts";

const vars = await readDevVars().catch(() => ({}) as Record<string, string>);
const rl = createInterface({ input: stdin, output: stdout });
let contact = vars.VAPID_CONTACT;
while (!contact || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
  contact = (await rl.question("Contact email for push services (they only use it if something goes wrong): ")).trim();
}
rl.close();

if (vars.VAPID_PUBLIC_KEY && vars.VAPID_PRIVATE_KEY) {
  await writeDevVars({ VAPID_CONTACT: contact });
  console.log("✓ Keeping the VAPID keys already in .dev.vars");
} else {
  const keys = await serializeVapidKeys(await generateVapidKeys());
  await writeDevVars({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_CONTACT: contact });
  console.log("✓ Generated VAPID keys and saved them to apps/api/.dev.vars");
}
console.log("Next: deploy (pnpm quickstart) so the Worker can send notifications.");
