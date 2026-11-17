/**
 * Trained sign-recognition model (e.g. ISL), produced by ai/signconnect_ai/train.py from the consent-based
 * dataset and published by an admin. Runs ON THE DEVICE with ONNX Runtime Web (WASM).
 *
 * Until an admin publishes a model, fetchPublishedModel() returns null and the app says so.
 * The downloaded file is verified against the SHA-256 the server recorded at upload, on every load.
 */
import { API_URL, absoluteUrl } from "../config";
import * as ort from "onnxruntime-web/wasm";
import { sha256Hex } from "./models";
import { handsPresent } from "./signFeatures";
import { resample } from "./signRecognizer";

export type IslManifest = {
  task: "SIGN_RECOGNITION";
  language: string;
  version: string;
  architecture: string;
  featureVersion: number;
  sequenceLength: number;
  featureDim: number;
  labels: { gloss: string; meaning: string }[];
  threshold: number;
  metrics: {
    testAccuracy: number | null;
    validationAccuracy: number | null;
    signerIndependent: boolean;
    trainSamples: number;
    testSamples: number;
    signers: number;
  };
  trainedAt: string;
};

export type PublishedModel = { id: string; manifest: IslManifest; sha256: string; sizeBytes: number; url: string };

export type IslPrediction =
  | { accepted: true; gloss: string; meaning: string; confidence: number; runnerUp?: string }
  | { accepted: false; reason: "LOW_CONFIDENCE" | "TOO_SHORT"; bestGloss?: string; confidence: number };

/** The feature format this app produces (signFeatures.ts). A model trained on anything else is refused. */
const SUPPORTED_FEATURE_VERSION = 1;
const SUPPORTED_FEATURE_DIM = 132;
const CACHE = "signconnect-models-v1";

ort.env.wasm.wasmPaths = "/vendor/ort/"; // served from this app (see vite.config.ts), not a CDN
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

export async function fetchPublishedModel(language: string): Promise<PublishedModel | null> {
  const res = await fetch(`${API_URL}/models/sign-recognition?language=${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Model lookup failed (HTTP ${res.status}).`);
  const body = (await res.json()) as { model: PublishedModel | null };
  return body.model;
}

export async function isModelCached(model: PublishedModel) {
  if (!("caches" in window)) return false;
  return !!(await (await caches.open(CACHE)).match(model.url));
}

export async function removeCachedModel(model: PublishedModel) {
  if ("caches" in window) await (await caches.open(CACHE)).delete(model.url);
}

async function loadVerifiedBytes(model: PublishedModel, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const cache = "caches" in window ? await caches.open(CACHE) : null;
  const hit = await cache?.match(model.url);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    if ((await sha256Hex(buf.buffer)) === model.sha256) {
      onProgress?.(1);
      return buf;
    }
    await cache?.delete(model.url);
  }
  const res = await fetch(absoluteUrl(model.url));
  if (!res.ok) throw new Error(`Model download failed (HTTP ${res.status}).`);
  const buf = new Uint8Array(await res.arrayBuffer());
  onProgress?.(0.9);
  const hash = await sha256Hex(buf.buffer);
  if (hash !== model.sha256) throw new Error(`Model checksum mismatch (got ${hash.slice(0, 12)}…); not installed.`);
  await cache?.put(model.url, new Response(buf));
  onProgress?.(1);
  return buf;
}

export class IslRecognizer {
  private constructor(
    readonly model: PublishedModel,
    private readonly session: ort.InferenceSession,
  ) {}

  get manifest() {
    return this.model.manifest;
  }

  static async load(model: PublishedModel, onProgress?: (f: number) => void): Promise<IslRecognizer> {
    const m = model.manifest;
    if (m.featureVersion !== SUPPORTED_FEATURE_VERSION || m.featureDim !== SUPPORTED_FEATURE_DIM) {
      throw new Error(`This model expects feature format v${m.featureVersion}/${m.featureDim}; the app produces v${SUPPORTED_FEATURE_VERSION}/${SUPPORTED_FEATURE_DIM}.`);
    }
    const bytes = await loadVerifiedBytes(model, onProgress);
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return new IslRecognizer(model, session);
  }

  /** frames: per-frame feature vectors of one segment (as produced by SignSegmenter). */
  async predict(frames: readonly Float32Array[]): Promise<IslPrediction> {
    const withHands = frames.filter((f) => handsPresent(f) > 0);
    if (withHands.length < 6) return { accepted: false, reason: "TOO_SHORT", confidence: 0 };
    const { sequenceLength: T, featureDim: D, labels, threshold } = this.manifest;
    const seq = resample(withHands, T);
    const data = new Float32Array(T * D);
    seq.forEach((f, i) => data.set(f, i * D));
    const out = await this.session.run({ landmarks: new ort.Tensor("float32", data, [1, T, D]) });
    const probs = out.probs.data as Float32Array;
    let best = 0;
    let second = -1;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[best]) {
        second = best;
        best = i;
      } else if (second < 0 || probs[i] > probs[second]) second = i;
    }
    const confidence = Math.round(probs[best] * 100) / 100;
    if (probs[best] < threshold) return { accepted: false, reason: "LOW_CONFIDENCE", bestGloss: labels[best].gloss, confidence };
    return { accepted: true, gloss: labels[best].gloss, meaning: labels[best].meaning, confidence, runnerUp: second >= 0 ? labels[second].gloss : undefined };
  }

  release() {
    void this.session.release();
  }
}
