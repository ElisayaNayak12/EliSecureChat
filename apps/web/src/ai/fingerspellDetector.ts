/**
 * Fingerspelling recognition: turns a live stream of hand-landmark frames into letters, so a signer can spell ANY
 * word (names, medicines, places) even when there is no sign for it yet.
 *
 * Fingerspellers keep their hands up and change shape quickly, so the word-level segmenter (which waits for the
 * hands to drop) does not fit. Instead this watches for HOLDS: when the hand shape stays still for a moment, that
 * shape is compared with letter examples (the signer's own recorded letters, plus built-in examples) and read as
 * a letter. A letter can repeat only after the hand changes shape or moves (the small bounce used for double
 * letters such as the LL in HELLO). When the best match is not clearly better than the next one, nothing is sent.
 *
 * Pure TypeScript (no DOM), unit-tested in test/fingerspellDetector.test.ts.
 */
import { frameFeatures, handsPresent, type HandObservation, type RawHand } from "./signFeatures";

const PER_HAND = 66;
const SHAPE_OFFSET = 3;
const SHAPE_DIM = 63;
export const FS_PREFIX = "FS-";

/** "FS-A" -> "A"; anything else -> null. */
export function letterOf(gloss: string): string | null {
  const m = /^FS-([A-Z0-9])$/.exec(gloss);
  return m ? m[1] : null;
}

/** The letters (and numbers) each sign language's fingerspelling uses, as dataset glosses. */
export function fingerspellGlosses(language: string): { gloss: string; meaning: string }[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const digits = "123456789".split("");
  const chars = language === "isl" || language === "asl" ? [...letters, ...digits] : letters;
  return chars.map((c) => ({ gloss: `${FS_PREFIX}${c}`, meaning: /\d/.test(c) ? `Number ${c}` : `Letter ${c}` }));
}

export type LetterTemplate = { char: string; hands: 1 | 2; shape: Float32Array };

function shapeOf(features: Float32Array, slot: number): Float32Array {
  return features.slice(slot * PER_HAND + SHAPE_OFFSET, slot * PER_HAND + SHAPE_OFFSET + SHAPE_DIM);
}

/** Mirror a one-hand shape left<->right (x flips sign), so left-handed signers match right-handed examples. */
function mirror(shape: Float32Array): Float32Array {
  const out = new Float32Array(shape);
  for (let i = 0; i < out.length; i += 3) out[i] = -out[i];
  return out;
}

/** The hand shape(s) in a frame: one hand -> 63 numbers, two hands -> 126 (left then right). */
export function frameShape(features: Float32Array): { hands: 0 | 1 | 2; shape: Float32Array | null; loc: [number, number] } {
  const left = features[0] > 0;
  const right = features[PER_HAND] > 0;
  if (left && right) {
    const s = new Float32Array(SHAPE_DIM * 2);
    s.set(shapeOf(features, 0), 0);
    s.set(shapeOf(features, 1), SHAPE_DIM);
    return { hands: 2, shape: s, loc: [(features[1] + features[PER_HAND + 1]) / 2, (features[2] + features[PER_HAND + 2]) / 2] };
  }
  if (left || right) {
    const slot = right ? 1 : 0;
    return { hands: 1, shape: shapeOf(features, slot), loc: [features[slot * PER_HAND + 1], features[slot * PER_HAND + 2]] };
  }
  return { hands: 0, shape: null, loc: [0, 0] };
}

const dist = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

/** Letter examples from recorded samples (gloss "FS-X"): the middle frames of each recording, where the hand holds still. */
export function templatesFromSamples(samples: { gloss: string; frames: ArrayLike<number>[] }[]): LetterTemplate[] {
  const out: LetterTemplate[] = [];
  for (const s of samples) {
    const char = letterOf(s.gloss);
    if (!char || s.frames.length === 0) continue;
    const n = s.frames.length;
    const mid = s.frames.slice(Math.floor(n * 0.3), Math.max(Math.floor(n * 0.3) + 1, Math.ceil(n * 0.7)));
    for (const f of mid.filter((_, i) => i % 2 === 0)) {
      const fs = frameShape(f instanceof Float32Array ? f : Float32Array.from(f));
      if (fs.shape) out.push({ char, hands: fs.hands as 1 | 2, shape: fs.shape });
    }
  }
  return out;
}

/** Built-in examples from raw landmarks ({ "A": [RawHand, ...] }); one-handed alphabets keep the clearest hand. */
export function templatesFromRaw(raw: Record<string, RawHand[]>, oneHanded: boolean): LetterTemplate[] {
  const out: LetterTemplate[] = [];
  for (const [char, hands] of Object.entries(raw)) {
    const keep = oneHanded ? [...hands].sort((a, b) => b.s - a.s).slice(0, 1) : hands;
    if (!keep.length) continue;
    const obs: HandObservation[] = keep.map((h) => ({
      handedness: h.h === "L" ? "Left" : "Right",
      score: h.s,
      landmarks: Array.from({ length: 21 }, (_, i) => ({ x: h.p[i * 3], y: h.p[i * 3 + 1], z: h.p[i * 3 + 2] })),
    }));
    const fs = frameShape(frameFeatures(obs));
    if (fs.shape) out.push({ char, hands: fs.hands as 1 | 2, shape: fs.shape });
  }
  return out;
}

export type FingerspellEvent =
  | { kind: "letter"; char: string; confidence: number }
  | { kind: "unsure"; best: string; second?: string };

export type FingerspellOptions = { holdMs: number; minFrames: number };

export class FingerspellDetector {
  private history: { t: number; shape: Float32Array; loc: [number, number]; hands: number }[] = [];
  private released = true;
  private lastShape: Float32Array | null = null;
  private lastLoc: [number, number] = [0, 0];
  private lastUnsureAt = 0;
  /** Distances are judged relative to how far apart the letters are from each other (calibrated once). */
  readonly acceptDist: number;
  readonly holdTol: number;
  readonly releaseDist: number;

  constructor(private readonly templates: LetterTemplate[], private readonly opts: FingerspellOptions = { holdMs: 280, minFrames: 4 }) {
    const gaps: number[] = [];
    for (const a of templates) {
      let best = Infinity;
      for (const b of templates) if (b.char !== a.char && b.hands === a.hands) best = Math.min(best, dist(a.shape, b.shape), a.hands === 1 ? dist(mirror(a.shape), b.shape) : Infinity);
      if (Number.isFinite(best)) gaps.push(best);
    }
    gaps.sort((x, y) => x - y);
    const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
    this.acceptDist = Math.max(0.35, typical * 1.1);
    this.holdTol = Math.max(0.12, typical * 0.3);
    this.releaseDist = Math.max(0.25, typical * 0.55);
  }

  get letterCount() {
    return new Set(this.templates.map((t) => t.char)).size;
  }

  reset() {
    this.history = [];
    this.released = true;
    this.lastShape = null;
  }

  private classify(shape: Float32Array, hands: number) {
    const perChar = new Map<string, number>();
    const mirrored = hands === 1 ? mirror(shape) : null;
    for (const t of this.templates) {
      if (t.hands !== hands) continue;
      const d = Math.min(dist(shape, t.shape), mirrored ? dist(mirrored, t.shape) : Infinity);
      if (d < (perChar.get(t.char) ?? Infinity)) perChar.set(t.char, d);
    }
    const ranked = [...perChar.entries()].sort((a, b) => a[1] - b[1]);
    return { best: ranked[0], second: ranked[1] };
  }

  /** Feed one frame of features (from frameFeatures) with its timestamp; returns a letter when one is read. */
  push(features: Float32Array, nowMs: number): FingerspellEvent | null {
    const fs = frameShape(features);
    if (!fs.shape || handsPresent(features) === 0) {
      this.history = [];
      this.released = true;
      return null;
    }
    // A shape change or a movement since the last letter "releases" it, so the next hold can be read.
    if (!this.released && this.lastShape) {
      const moved = Math.hypot(fs.loc[0] - this.lastLoc[0], fs.loc[1] - this.lastLoc[1]);
      if (fs.shape.length !== this.lastShape.length || dist(fs.shape, this.lastShape) > this.releaseDist || moved > 0.9) {
        this.released = true;
        this.history = []; // the next letter needs a fresh hold of its own
      }
    }
    this.history.push({ t: nowMs, shape: fs.shape, loc: fs.loc, hands: fs.hands });
    while (this.history.length && nowMs - this.history[0].t > this.opts.holdMs) this.history.shift();
    if (!this.released || this.history.length < this.opts.minFrames || nowMs - this.history[0].t < this.opts.holdMs * 0.8) return null;
    if (this.history.some((h) => h.hands !== fs.hands)) return null;
    // Still enough to count as a hold? Same shape AND the hand stays in place.
    for (const h of this.history) {
      if (dist(h.shape, fs.shape) > this.holdTol) return null;
      if (Math.hypot(h.loc[0] - fs.loc[0], h.loc[1] - fs.loc[1]) > 0.5) return null;
    }

    const mean = new Float32Array(fs.shape.length);
    for (const h of this.history) for (let i = 0; i < mean.length; i++) mean[i] += h.shape[i] / this.history.length;
    const { best, second } = this.classify(mean, fs.hands);
    if (!best) return null;
    const clear = best[1] <= this.acceptDist && (!second || best[1] < second[1] * 0.8);
    if (!clear) {
      if (nowMs - this.lastUnsureAt > 1200) {
        this.lastUnsureAt = nowMs;
        return { kind: "unsure", best: best[0], second: second?.[0] };
      }
      return null;
    }
    this.released = false;
    this.lastShape = mean;
    this.lastLoc = fs.loc;
    const confidence = Math.max(0, Math.min(1, 1 - best[1] / (this.acceptDist * 1.5)));
    return { kind: "letter", char: best[0], confidence: Math.round(confidence * 100) / 100 };
  }
}
