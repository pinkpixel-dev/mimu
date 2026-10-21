import type { Client } from "@libsql/client";
import { deserializeVapidKeys, sendPushNotification } from "web-push-browser";
import { deleteSubscription, listSubscriptions } from "../repo/push.ts";

export interface PushConfig {
  /** VAPID keys from `pnpm --filter @mimu/api vapid`: raw public key and PKCS8 private key, both base64url. */
  publicKey: string;
  privateKey: string;
  /** Email address push services can contact about this sender (sent as a mailto: claim). */
  contact: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes, relative to the app (e.g. "#/note/<id>"). */
  url?: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

/**
 * Send a notification to every device subscribed in this database, encrypted with aes128gcm (RFC 8291), which every
 * current push service accepts. Subscriptions the push service says are gone (404 or 410) are deleted.
 * Returns how many deliveries the push services accepted.
 */
export async function sendToAll(db: Client, config: PushConfig, payload: PushPayload): Promise<number> {
  const subscriptions = await listSubscriptions(db);
  if (subscriptions.length === 0) return 0;
  const keys = await deserializeVapidKeys({ publicKey: config.publicKey, privateKey: config.privateKey });
  let delivered = 0;
  for (const subscription of subscriptions) {
    try {
      const response = await sendPushNotification(keys, subscription, config.contact, JSON.stringify(payload), {
        algorithm: "aes128gcm",
        ttl: 6 * 60 * 60,
        urgency: "high",
      });
      if (response.status === 404 || response.status === 410) await deleteSubscription(db, subscription.endpoint);
      else if (response.ok) delivered++;
      else console.error(`Push to ${new URL(subscription.endpoint).host} failed: ${response.status}`);
    } catch (error) {
      console.error("Push failed", error);
    }
  }
  return delivered;
}
