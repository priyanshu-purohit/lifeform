// Local-only storage for session summaries, using the browser's built-in IndexedDB.
// Nothing here leaves the machine. Browser-only: never call during the server render.

import type { SessionSummary } from "./session.types";

const DB_NAME = "lifeform";
const DB_VERSION = 1;
const STORE = "sessions";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notifies when sessions are saved or deleted, so lists can refresh. */
export function subscribeSessions(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local storage (IndexedDB) is not available."));
  }
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("startedAt", "startedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    dbPromise = null; // allow a retry later
    throw error;
  });
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    // Resolve on commit, not on request success, so a write is really on disk.
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted."));
  });
}

/** Saves or replaces a summary (same id = same session, so saving twice is harmless). */
export async function saveSession(summary: SessionSummary): Promise<void> {
  await run("readwrite", (store) => store.put(summary));
  notify();
}

/** All saved sessions, newest first. */
export async function listSessions(): Promise<SessionSummary[]> {
  const all = await run<SessionSummary[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getSession(id: string): Promise<SessionSummary | null> {
  const found = await run<SessionSummary | undefined>("readonly", (store) => store.get(id));
  return found ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
  notify();
}

export async function deleteAllSessions(): Promise<void> {
  await run("readwrite", (store) => store.clear());
  notify();
}
