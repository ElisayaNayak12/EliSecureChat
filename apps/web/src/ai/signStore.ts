/**
 * Personal sign examples are stored ONLY on this device (IndexedDB). Raw video is never stored;
 * only the landmark feature sequences. Nothing here is uploaded (spec section 10, local by default).
 */
import type { SignTemplate } from "./signRecognizer";
import { sanitizeMeanings, type GestureMeanings } from "./gestures";

export type StoredSample = {
  id: string;
  userId: string;
  language: string;
  gloss: string;
  meaning: string;
  frames: number[][];
  createdAt: string;
};

const DB = "signconnect";
const STORE = "personalSigns";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("byUserLang", ["userId", "language"]);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export function listSamples(userId: string, language: string): Promise<StoredSample[]> {
  return tx("readonly", (s) => s.index("byUserLang").getAll([userId, language]) as IDBRequest<StoredSample[]>);
}

export async function addSample(sample: Omit<StoredSample, "id" | "createdAt" | "frames"> & { frames: Float32Array[] }) {
  const record: StoredSample = {
    ...sample,
    gloss: sample.gloss.trim().toUpperCase(),
    meaning: sample.meaning.trim(),
    frames: sample.frames.map((f) => Array.from(f, (v) => Math.round(v * 1e4) / 1e4)),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.put(record));
  return record;
}

export function deleteSample(id: string) {
  return tx("readwrite", (s) => s.delete(id));
}

export async function deleteGloss(userId: string, language: string, gloss: string) {
  for (const s of await listSamples(userId, language)) if (s.gloss === gloss) await deleteSample(s.id);
}

/* ---- per-user English meanings for the built-in gestures (a convenience setting, kept on this device) ---- */
const meaningsKey = (userId: string) => `gesture-meanings:${userId}`;

export function loadGestureMeanings(userId: string): GestureMeanings {
  try {
    return sanitizeMeanings(JSON.parse(localStorage.getItem(meaningsKey(userId)) ?? "null"));
  } catch {
    return sanitizeMeanings(null);
  }
}

export function saveGestureMeanings(userId: string, meanings: GestureMeanings) {
  try {
    localStorage.setItem(meaningsKey(userId), JSON.stringify(meanings));
    return true;
  } catch {
    return false;
  }
}

export function toTemplates(samples: StoredSample[]): SignTemplate[] {
  return samples.map((s) => ({ id: s.id, gloss: s.gloss, meaning: s.meaning, frames: s.frames.map((f) => Float32Array.from(f)) }));
}
