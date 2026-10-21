import type { CaptureInput } from "@mimu/shared";

/** Minimal IndexedDB store for captures that haven't reached the API yet. */
const DB_NAME = "mimu";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const outboxStore = {
  put: (capture: CaptureInput) => run("readwrite", (store) => store.put(capture)).then(() => undefined),
  remove: (id: string) => run("readwrite", (store) => store.delete(id)).then(() => undefined),
  all: () => run<CaptureInput[]>("readonly", (store) => store.getAll()),
  clear: () => run("readwrite", (store) => store.clear()).then(() => undefined),
};
