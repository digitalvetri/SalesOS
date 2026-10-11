// IndexedDB-based draft autosave (spec §11.3 "Drafts autosave locally
// (IndexedDB) after every field change. Reopening offers 'Continue draft from HH:MM'.").
// Simple key→JSON blob store scoped to the signed-in user's tenant+userId
// to avoid cross-tenant leakage on shared devices.
"use client";

const DB_NAME = "salesos-drafts";
const DB_VERSION = 1;
const STORE = "drafts";

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type DraftRecord<T> = {
  key: string;
  value: T;
  savedAt: number;
};

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, value, savedAt: Date.now() } satisfies DraftRecord<T>);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDraft<T>(key: string): Promise<DraftRecord<T> | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const row = await new Promise<DraftRecord<T> | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as DraftRecord<T> | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row;
}

export async function clearDraft(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function formatSavedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
