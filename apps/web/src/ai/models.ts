/**
 * On-device model registry and manager (spec section 4, "Model manager").
 *
 * Implemented: download with progress, SHA-256 verification against a pinned hash, local caching
 * (Cache Storage), removal, status reporting, GPU -> CPU fallback in the runtimes.
 * Not implemented yet: digital-signature verification, server-driven version updates and rollback.
 */

export type ModelStatus = "WORKING" | "PROTOTYPE";

export type ModelInfo = {
  id: string;
  name: string;
  task: string;
  version: string;
  runtime: string;
  license: string;
  provenance: string;
  approxBytes: number;
  status: ModelStatus;
};

/** Hand tracking + built-in gestures. The Gesture Recognizer bundle includes MediaPipe's hand landmarker. */
export const HAND_MODEL: ModelInfo & { url: string; sha256: string } = {
  id: "mediapipe-gesture-recognizer",
  name: "MediaPipe Gesture Recognizer",
  task: "Hand landmarks (21 points, up to 2 hands) + 7 built-in hand gestures (👍 👎 ✋ ✊ ☝️ ✌️ 🤟)",
  version: "float16/1",
  runtime: "MediaPipe Tasks (WASM, GPU when available)",
  license: "Apache-2.0",
  provenance: "Google MediaPipe, storage.googleapis.com/mediapipe-models",
  approxBytes: 8_373_440,
  status: "WORKING",
  url: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  // Pinned on 2026-11-10. A download whose hash differs is rejected.
  sha256: "97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482",
};

export const ASR_MODEL: ModelInfo & { repo: string; dtype: "q8" } = {
  id: "whisper-tiny.en",
  name: "Whisper tiny (English)",
  task: "Offline speech-to-text for live captions",
  version: "onnx-community/whisper-tiny.en, 8-bit quantised",
  runtime: "Transformers.js + ONNX Runtime Web (WASM)",
  license: "MIT (OpenAI Whisper weights)",
  provenance: "OpenAI Whisper, ONNX conversion by onnx-community on Hugging Face",
  approxBytes: 41_000_000,
  status: "PROTOTYPE",
  repo: "onnx-community/whisper-tiny.en",
  dtype: "q8",
};

const CACHE = "signconnect-models-v1";

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ModelIntegrityError extends Error {}

/** Returns the verified hand model, downloading it once. Every load is re-verified, including from cache. */
export async function loadHandModel(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const cache = "caches" in window ? await caches.open(CACHE) : null;
  const cached = await cache?.match(HAND_MODEL.url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if ((await sha256Hex(buf)) === HAND_MODEL.sha256) {
      onProgress?.(1);
      return new Uint8Array(buf);
    }
    await cache?.delete(HAND_MODEL.url); // corrupted cache entry: fall through to a fresh download
  }

  const res = await fetch(HAND_MODEL.url);
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get("content-length")) || HAND_MODEL.approxBytes;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(0.99, received / total));
  }
  const buf = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  const hash = await sha256Hex(buf.buffer);
  if (hash !== HAND_MODEL.sha256) {
    throw new ModelIntegrityError(`Hand model checksum mismatch (got ${hash.slice(0, 12)}…). The file was not installed.`);
  }
  await cache?.put(HAND_MODEL.url, new Response(buf, { headers: { "Content-Type": "application/octet-stream" } }));
  onProgress?.(1);
  return buf;
}

export async function isHandModelInstalled(): Promise<boolean> {
  if (!("caches" in window)) return false;
  return !!(await (await caches.open(CACHE)).match(HAND_MODEL.url));
}

export async function removeHandModel() {
  if ("caches" in window) await (await caches.open(CACHE)).delete(HAND_MODEL.url);
}

/** Transformers.js keeps its own cache; we only inspect and clear the entries for our ASR model. */
const TRANSFORMERS_CACHE = "transformers-cache";

export async function isAsrModelInstalled(): Promise<boolean> {
  if (!("caches" in window)) return false;
  const keys = await (await caches.open(TRANSFORMERS_CACHE)).keys();
  return keys.some((k) => k.url.includes(ASR_MODEL.repo) && k.url.includes(".onnx"));
}

export async function removeAsrModel() {
  if (!("caches" in window)) return;
  const cache = await caches.open(TRANSFORMERS_CACHE);
  for (const k of await cache.keys()) if (k.url.includes(ASR_MODEL.repo)) await cache.delete(k);
}

export function formatBytes(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
}
