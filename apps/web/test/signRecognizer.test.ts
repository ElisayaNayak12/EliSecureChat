/**
 * Algorithm tests for the personal sign recognizer using SYNTHETIC hand trajectories.
 * These check the algorithm's behaviour (matching, rejection, speed tolerance, segmentation).
 * They are not a measure of real-world sign-recognition accuracy, which needs real signers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURE_DIM, frameFeatures, handsPresent, type HandObservation, type Point3 } from "../src/ai/signFeatures";
import { PersonalSignClassifier, SignSegmenter, dtwDistance, resample, type SignTemplate } from "../src/ai/signRecognizer";

// Deterministic PRNG so tests are repeatable.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** A hand at (cx, cy); `curl` 0 = open palm, 1 = fist. */
function hand(cx: number, cy: number, curl: number, noise: () => number, size = 0.08): HandObservation {
  const pts: Point3[] = [{ x: cx, y: cy, z: 0 }];
  for (let f = 0; f < 5; f++) {
    const angle = -Math.PI / 2 + (f - 2) * 0.35;
    for (let j = 1; j <= 4; j++) {
      const reach = size * (j === 1 ? 0.5 : (0.5 + (j - 1) * 0.5 / 3) * (1 - 0.6 * curl));
      pts.push({
        x: cx + Math.cos(angle) * reach + (noise() - 0.5) * 0.004,
        y: cy + Math.sin(angle) * reach + (noise() - 0.5) * 0.004,
        z: (noise() - 0.5) * 0.01,
      });
    }
  }
  return { landmarks: pts, handedness: "Right", score: 0.95 };
}

type Motion = (t: number) => { x: number; y: number; curl: number };
const SWIPE: Motion = (t) => ({ x: 0.3 + 0.4 * t, y: 0.5, curl: 0 });
const NOD: Motion = (t) => ({ x: 0.5, y: 0.3 + 0.4 * t, curl: 1 });
const CIRCLE: Motion = (t) => ({ x: 0.5 + 0.2 * Math.cos(t * 2 * Math.PI), y: 0.5 + 0.2 * Math.sin(t * 2 * Math.PI), curl: 0.5 });

function perform(motion: Motion, frames: number, seed: number, distance = 1): Float32Array[] {
  const noise = rng(seed);
  return Array.from({ length: frames }, (_, i) => {
    const m = motion(i / (frames - 1));
    return frameFeatures([hand(m.x, m.y, m.curl, noise, 0.08 * distance)]);
  });
}

function templates(): SignTemplate[] {
  const out: SignTemplate[] = [];
  [24, 30, 36].forEach((len, i) => {
    out.push({ id: `s${i}`, gloss: "THANK-YOU", meaning: "Thank you", frames: perform(SWIPE, len, 10 + i) });
    out.push({ id: `n${i}`, gloss: "YES", meaning: "Yes", frames: perform(NOD, len, 20 + i) });
  });
  return out;
}

test("frameFeatures has a fixed size, marks presence and is invariant to hand distance from the camera", () => {
  const noise = rng(1);
  const near = frameFeatures([hand(0.5, 0.5, 0, () => 0.5, 0.12)]);
  const far = frameFeatures([hand(0.5, 0.5, 0, () => 0.5, 0.06)]);
  assert.equal(near.length, FEATURE_DIM);
  assert.equal(handsPresent(near), 1);
  assert.equal(handsPresent(frameFeatures([])), 0);
  for (let i = 3; i < 66; i++) assert.ok(Math.abs(near[i] - far[i]) < 1e-4, `scale-normalised feature ${i}`);
  assert.equal(handsPresent(frameFeatures([hand(0.4, 0.5, 0, noise), { ...hand(0.6, 0.5, 0, noise), handedness: "Left" }])), 2);
});

test("resample produces the requested length and preserves endpoints", () => {
  const seq = perform(SWIPE, 50, 3);
  const r = resample(seq, 32);
  assert.equal(r.length, 32);
  assert.deepEqual(Array.from(r[0]), Array.from(seq[0]));
  assert.deepEqual(Array.from(r[31]), Array.from(seq[49]));
});

test("DTW is zero for identical sequences and tolerant of speed differences", () => {
  const a = resample(perform(SWIPE, 30, 5));
  assert.equal(dtwDistance(a, a), 0);
  const slow = resample(perform(SWIPE, 60, 6));
  const other = resample(perform(NOD, 30, 7));
  assert.ok(dtwDistance(a, slow) < dtwDistance(a, other));
});

test("recognises each recorded sign performed again with noise, at a different speed and distance", () => {
  const clf = new PersonalSignClassifier(templates());
  assert.equal(clf.glossCount, 2);
  const swipe = clf.classify(perform(SWIPE, 45, 99, 1.3));
  assert.equal(swipe.accepted, true, JSON.stringify(swipe));
  if (swipe.accepted) {
    assert.equal(swipe.gloss, "THANK-YOU");
    assert.equal(swipe.meaning, "Thank you");
    assert.ok(swipe.confidence > 0.3, `confidence ${swipe.confidence}`);
  }
  const nod = clf.classify(perform(NOD, 20, 77, 0.8));
  assert.equal(nod.accepted && nod.gloss, "YES");
});

test("rejects a movement it was never taught instead of guessing", () => {
  const clf = new PersonalSignClassifier(templates());
  const r = clf.classify(perform(CIRCLE, 30, 55));
  assert.equal(r.accepted, false, JSON.stringify(r));
});

test("reports NO_TEMPLATES and TOO_SHORT", () => {
  assert.deepEqual(new PersonalSignClassifier([]).classify(perform(SWIPE, 30, 1)), { accepted: false, reason: "NO_TEMPLATES", confidence: 0 });
  const r = new PersonalSignClassifier(templates()).classify(perform(SWIPE, 4, 1));
  assert.equal(r.accepted, false);
  assert.equal(!r.accepted && r.reason, "TOO_SHORT");
});

test("segmenter cuts a stream into one segment per sign when hands drop out of view between signs", () => {
  const empty = () => frameFeatures([]);
  const stream = [
    ...Array.from({ length: 10 }, empty),
    ...perform(SWIPE, 30, 1),
    ...Array.from({ length: 10 }, empty),
    ...perform(NOD, 25, 2),
    ...Array.from({ length: 10 }, empty),
  ];
  const seg = new SignSegmenter();
  const segments = stream.map((f) => seg.push(f)).filter((s): s is Float32Array[] => !!s);
  assert.equal(segments.length, 2);
  const clf = new PersonalSignClassifier(templates());
  const results = segments.map((s) => clf.classify(s));
  assert.deepEqual(results.map((r) => r.accepted && r.gloss), ["THANK-YOU", "YES"]);
});

test("segmenter ignores brief hand flickers", () => {
  const seg = new SignSegmenter();
  const empty = frameFeatures([]);
  const flick = perform(SWIPE, 3, 1);
  const out = [...flick, empty, empty, empty, empty, empty, empty, empty, empty].map((f) => seg.push(f)).filter(Boolean);
  assert.equal(out.length, 0);
});

test("segmenter works the same on a slow device (4 fps, real timestamps)", () => {
  const seg = new SignSegmenter();
  const empty = frameFeatures([]);
  // Two signs, each held ~2 s, separated by a ~1.25 s pause, sampled at only 4 frames per second.
  const frames = [
    ...Array.from({ length: 3 }, () => empty),
    ...perform(SWIPE, 8, 1),
    ...Array.from({ length: 5 }, () => empty),
    ...perform(NOD, 8, 2),
    ...Array.from({ length: 5 }, () => empty),
  ];
  const segments = frames.map((f, i) => seg.push(f, i * 250)).filter((s): s is Float32Array[] => !!s);
  assert.equal(segments.length, 2, "each sign becomes its own segment instead of merging or being dropped");
  // A brief flicker (2 frames = 250 ms) is still ignored at this rate.
  const flick = perform(SWIPE, 1, 1);
  const out = [...flick, empty, empty, empty, empty].map((f, i) => seg.push(f, 100_000 + i * 250)).filter(Boolean);
  assert.equal(out.length, 0);
});
