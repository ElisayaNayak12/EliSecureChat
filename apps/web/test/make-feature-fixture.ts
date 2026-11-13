/**
 * Writes ai/tests/fixtures/features_fixture.json: raw frames + the features/resampling computed by THIS
 * TypeScript code. The Python trainer must reproduce them exactly (ai/tests/test_features_parity.py).
 * Run: node --import tsx test/make-feature-fixture.ts
 */
import { writeFileSync } from "node:fs";
import { frameFeatures, rawToHands, type RawHand } from "../src/ai/signFeatures";
import { resample } from "../src/ai/signRecognizer";

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const hand = (h: "L" | "R", cx: number, cy: number, s: number): RawHand => ({
  h, s, p: Array.from({ length: 63 }, (_, k) => (k % 3 === 0 ? cx : k % 3 === 1 ? cy : 0) + (k < 3 ? 0 : (rnd() - 0.5) * 0.12)).map((v) => Math.round(v * 1e5) / 1e5),
});

const frames: { t: number; hands: RawHand[] }[] = [];
for (let i = 0; i < 23; i++) {
  const hands: RawHand[] = [];
  if (i % 7 !== 3) hands.push(hand("R", 0.4 + i * 0.01, 0.5, 0.9));
  if (i % 3 === 0) hands.push(hand("L", 0.6, 0.45 - i * 0.005, 0.8));
  if (i === 10) hands.push(hand("R", 0.3, 0.3, 0.95)); // two "Right" hands: slot reassignment path
  frames.push({ t: i * 50, hands });
}
const features = frames.map((f) => Array.from(frameFeatures(rawToHands(f.hands))));
const resampled = resample(features.map((f) => Float32Array.from(f)), 32).map((f) => Array.from(f));
writeFileSync(new URL("../../../ai/tests/fixtures/features_fixture.json", import.meta.url), JSON.stringify({ frames, features, resampled }));
console.log(`fixture: ${frames.length} frames, ${features[0].length} dims`);
