import type { ApiClient } from "./api/client.ts";

/** Why push can't be turned on here, if it can't. iPhones only allow it once Mimu is added to the Home Screen. */
export type PushSupport = "supported" | "needs-home-screen" | "unsupported";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable) return "supported";
  return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
}

/** Register the service worker once per page load. Push needs it; nothing else in the app does. */
let registration: Promise<ServiceWorkerRegistration> | null = null;
export function serviceWorker(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);
  return registration;
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** This device's current subscription, if notifications are on. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return null;
  return (await serviceWorker()).pushManager.getSubscription();
}

/**
 * Ask for permission, subscribe this device, and register it with the API.
 * Returns "blocked" if the person (or browser) said no.
 */
export async function enablePush(api: ApiClient): Promise<"on" | "blocked" | "disabled"> {
  const publicKey = await api.pushPublicKey();
  if (!publicKey) return "disabled";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";
  const worker = await serviceWorker();
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) }));
  await api.savePushSubscription(subscription.toJSON());
  return "on";
}

export async function disablePush(api: ApiClient): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.deletePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
