/// <reference lib="webworker" />
/**
 * Offline speech recognition worker: Whisper tiny.en via Transformers.js + ONNX Runtime Web (WASM).
 * Audio never leaves the device. The model files are fetched once from Hugging Face and cached by the browser.
 */
import { env, pipeline } from "@huggingface/transformers";
import { ASR_MODEL } from "./models";

type Inbound = { type: "load" } | { type: "transcribe"; id: number; audio: Float32Array; final: boolean };

env.allowLocalModels = false;
// Serve the ONNX Runtime WASM from this app (see vite.config.ts), not from a CDN.
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = {
    mjs: "/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs",
    wasm: "/vendor/ort/ort-wasm-simd-threaded.asyncify.wasm",
  };
  // Multi-threading needs cross-origin isolation, which this app does not enable yet.
  if (!self.crossOriginIsolated) onnx.wasm.numThreads = 1;
}

type Transcriber = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let transcriber: Promise<Transcriber> | null = null;

function load(): Promise<Transcriber> {
  if (!transcriber) {
    const files = new Map<string, { loaded: number; total: number }>();
    transcriber = (pipeline("automatic-speech-recognition", ASR_MODEL.repo, {
      dtype: ASR_MODEL.dtype,
      device: "wasm",
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === "progress" && p.file) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          postMessage({ type: "progress", fraction: total ? loaded / total : 0 });
        }
      },
    }) as unknown as Promise<Transcriber>).catch((err) => {
      transcriber = null;
      throw err;
    });
  }
  return transcriber;
}

/** Whisper emits tags like "[BLANK_AUDIO]" or "(wind blowing)" for non-speech; they are not captions. */
const NON_SPEECH = /^\s*[\[(][^\])]*[\])]\s*$|^\s*\.+\s*$/;

self.onmessage = async (e: MessageEvent<Inbound>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load();
      postMessage({ type: "ready" });
      return;
    }
    if (msg.type === "transcribe") {
      const t = await load();
      const started = performance.now();
      const out = await t(msg.audio, { language: undefined, return_timestamps: false });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
      postMessage({
        type: "result",
        id: msg.id,
        final: msg.final,
        text: NON_SPEECH.test(text) ? "" : text,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  } catch (err) {
    postMessage({ type: "error", id: (msg as { id?: number }).id, message: (err as Error).message });
  }
};
