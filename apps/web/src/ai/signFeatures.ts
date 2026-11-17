/**
 * Turns MediaPipe hand landmarks into a fixed-size, normalised feature vector per video frame.
 *
 * This is landmark processing, NOT sign recognition (spec 5.2). Recognition happens in signRecognizer.ts.
 * Pure TypeScript (no DOM) so it can be unit-tested in Node.
 */

export type Point3 = { x: number; y: number; z: number };
export type HandObservation = { landmarks: Point3[]; handedness: "Left" | "Right"; score: number };

const LANDMARKS_PER_HAND = 21;
const WRIST = 0;
const MIDDLE_MCP = 9;
/** presence flag + wrist position (x, y) + 21 wrist-relative points (x, y, z) */
const PER_HAND = 1 + 2 + LANDMARKS_PER_HAND * 3;
export const FEATURE_DIM = PER_HAND * 2;

/** Palm knuckles: index, middle, pinky MCP. They do not move when fingers curl, so palm size is stable. */
const PALM_POINTS = [5, MIDDLE_MCP, 17];
/**
 * Where the hand is and how it moves carries as much meaning as finger shape in sign languages, but it is
 * only 2 of 66 numbers per hand. Weighting it keeps movement from being drowned out by small finger jitter.
 */
const LOCATION_WEIGHT = 6;
/** Finger shape is down-weighted relative to location; z (depth) from a single camera is the noisiest axis. */
const SHAPE_WEIGHT = 0.5;
const DEPTH_WEIGHT = 0.5;

function writeHand(out: Float32Array, offset: number, hand: HandObservation) {
  const lm = hand.landmarks;
  const wrist = lm[WRIST];
  // Palm size makes the features independent of distance from the camera.
  let scale = 0;
  for (const i of PALM_POINTS) scale += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y);
  scale = scale / PALM_POINTS.length || 1e-6;
  out[offset] = 1;
  // Coarse location of the hand in the frame (e.g. near the face vs. the chest).
  out[offset + 1] = (wrist.x - 0.5) * 2 * LOCATION_WEIGHT;
  out[offset + 2] = (wrist.y - 0.5) * 2 * LOCATION_WEIGHT;
  for (let i = 0; i < LANDMARKS_PER_HAND; i++) {
    const p = lm[i];
    const o = offset + 3 + i * 3;
    out[o] = ((p.x - wrist.x) / scale) * SHAPE_WEIGHT;
    out[o + 1] = ((p.y - wrist.y) / scale) * SHAPE_WEIGHT;
    out[o + 2] = ((p.z - wrist.z) / scale) * SHAPE_WEIGHT * DEPTH_WEIGHT;
  }
}

/**
 * One frame -> FEATURE_DIM floats. Slot 0 = "Left" hand, slot 1 = "Right" hand (as labelled by MediaPipe).
 * A missing hand is all zeros. If both detections claim the same label, the higher-scoring one wins the slot
 * and the other takes the free slot.
 */
export function frameFeatures(hands: readonly HandObservation[]): Float32Array {
  const out = new Float32Array(FEATURE_DIM);
  const valid = hands.filter((h) => h.landmarks.length === LANDMARKS_PER_HAND).sort((a, b) => b.score - a.score).slice(0, 2);
  const slots: (HandObservation | null)[] = [null, null];
  for (const h of valid) {
    const preferred = h.handedness === "Left" ? 0 : 1;
    if (!slots[preferred]) slots[preferred] = h;
    else if (!slots[1 - preferred]) slots[1 - preferred] = h;
  }
  slots.forEach((h, i) => h && writeHand(out, i * PER_HAND, h));
  return out;
}

export function handsPresent(features: Float32Array): number {
  return (features[0] > 0 ? 1 : 0) + (features[PER_HAND] > 0 ? 1 : 0);
}

/* ---- compact raw format used by the dataset (mirrors backend dataset-rules RawHand) ---- */
export type RawHand = { h: "L" | "R"; s: number; p: number[] };

/** Landmarks rounded to 5 decimals (~0.01 px at 1000 px): far below MediaPipe's own jitter. */
export function handsToRaw(hands: readonly HandObservation[]): RawHand[] {
  return hands.map((h) => ({
    h: h.handedness === "Left" ? "L" : "R",
    s: Math.round(h.score * 1000) / 1000,
    p: h.landmarks.flatMap((pt) => [pt.x, pt.y, pt.z].map((v) => Math.round(v * 1e5) / 1e5)),
  }));
}

export function rawToHands(raw: readonly RawHand[]): HandObservation[] {
  return raw.map((r) => ({
    handedness: r.h === "L" ? "Left" : "Right",
    score: r.s,
    landmarks: Array.from({ length: 21 }, (_, i) => ({ x: r.p[i * 3], y: r.p[i * 3 + 1], z: r.p[i * 3 + 2] })),
  }));
}
