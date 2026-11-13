/**
 * Runs MediaPipe Gesture Recognizer on a <video> element, on the device.
 * One model gives both hand landmarks (for the personal sign recognizer) and built-in gesture labels.
 * Uses the GPU delegate when available and falls back to CPU (spec section 4, graceful fallback).
 */
import { FilesetResolver, GestureRecognizer, type GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { loadHandModel } from "./models";
import type { HandObservation } from "./signFeatures";
import type { GestureFrame } from "./gestures";

export type HandTracker = {
  delegate: "GPU" | "CPU";
  detect(video: HTMLVideoElement, timestampMs: number): { hands: HandObservation[]; gesture: GestureFrame; raw: GestureRecognizerResult };
  close(): void;
};

let shared: Promise<HandTracker> | null = null;
let lastProgress = 0;
const progressListeners = new Set<(fraction: number) => void>();

/** One tracker per page; it is expensive to create. Every caller gets progress, even if loading already started. */
export function getHandTracker(onProgress?: (fraction: number) => void): Promise<HandTracker> {
  if (onProgress) {
    progressListeners.add(onProgress);
    onProgress(lastProgress);
  }
  if (!shared) {
    lastProgress = 0;
    shared = createHandTracker((f) => {
      lastProgress = f;
      progressListeners.forEach((l) => l(f));
    }).catch((err) => {
      shared = null; // allow a retry after a failure
      throw err;
    });
  }
  const p = shared;
  if (onProgress) void p.finally(() => progressListeners.delete(onProgress)).catch(() => undefined);
  return p;
}

async function createHandTracker(onProgress?: (fraction: number) => void): Promise<HandTracker> {
  const model = await loadHandModel(onProgress);
  const fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe");
  const make = (delegate: "GPU" | "CPU") =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let delegate: "GPU" | "CPU" = "GPU";
  let recognizer: GestureRecognizer;
  try {
    recognizer = await make("GPU");
  } catch (err) {
    console.warn("GPU delegate unavailable, using CPU for hand tracking:", err);
    delegate = "CPU";
    recognizer = await make("CPU");
  }
  // Warm-up: the first inference compiles GPU shaders and can block for seconds. Pay that cost now
  // (during preload) instead of in the first seconds of a call.
  let lastTs = -1;
  try {
    const warm = document.createElement("canvas");
    warm.width = 256;
    warm.height = 256;
    warm.getContext("2d")?.fillRect(0, 0, 256, 256);
    const t = performance.now();
    recognizer.recognizeForVideo(warm, t);
    lastTs = t;
  } catch (err) {
    console.warn("Vision model warm-up failed:", err);
  }
  return {
    delegate,
    detect(video, timestampMs) {
      // MediaPipe requires strictly increasing timestamps.
      const ts = timestampMs <= lastTs ? lastTs + 1 : timestampMs;
      lastTs = ts;
      const raw = recognizer.recognizeForVideo(video, ts);
      const hands: HandObservation[] = raw.landmarks.map((lm, i) => ({
        landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        handedness: (raw.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right") as "Left" | "Right",
        score: raw.handedness[i]?.[0]?.score ?? 0,
      }));
      // Strongest real gesture across both hands ("None" means a hand with no known gesture).
      let gesture: GestureFrame = null;
      for (const cats of raw.gestures) {
        const top = cats[0];
        if (top && top.categoryName !== "None" && (!gesture || top.score > gesture.score)) gesture = { name: top.categoryName, score: top.score };
      }
      return { hands, gesture, raw };
    },
    close() {
      recognizer.close();
      shared = null;
    },
  };
}

/** Draws hand skeletons on a canvas sized to the video (mirrored to match a selfie view if requested). */
export function drawHands(canvas: HTMLCanvasElement, hands: HandObservation[], mirrored: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const X = (x: number) => (mirrored ? (1 - x) * w : x * w);
  for (const hand of hands) {
    ctx.strokeStyle = "rgba(214, 232, 196, 0.9)";
    ctx.lineWidth = Math.max(2, w / 260);
    for (const c of GestureRecognizer.HAND_CONNECTIONS) {
      const a = hand.landmarks[c.start];
      const b = hand.landmarks[c.end];
      ctx.beginPath();
      ctx.moveTo(X(a.x), a.y * h);
      ctx.lineTo(X(b.x), b.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "#BFD4A7";
    for (const p of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(X(p.x), p.y * h, Math.max(2.5, w / 200), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
