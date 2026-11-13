/**
 * PERSONAL sign recognizer (functional prototype).
 *
 * What it is: a nearest-neighbour classifier using Dynamic Time Warping over hand-landmark sequences.
 * It recognises only the signs that THIS user recorded as examples on their own device.
 *
 * What it is NOT: a trained Indian Sign Language model. It has no vocabulary of its own, does not
 * generalise across signers, and does not translate grammar. Each recognised sign maps to the English
 * meaning the user typed when recording it. Results below the acceptance threshold are reported as
 * "not recognised" instead of guessed (spec section 13).
 *
 * Pure TypeScript (no DOM) so it can be unit-tested in Node.
 */
import { FEATURE_DIM, handsPresent } from "./signFeatures";

export const RESAMPLE_LENGTH = 32;
export const MIN_SAMPLES_PER_SIGN = 3;

export type SignTemplate = { id: string; gloss: string; meaning: string; frames: Float32Array[] };

export type Recognition =
  | { accepted: true; gloss: string; meaning: string; confidence: number; distance: number; runnerUp?: string }
  | { accepted: false; reason: "NO_TEMPLATES" | "TOO_SHORT" | "NO_CLOSE_MATCH" | "AMBIGUOUS"; distance?: number; bestGloss?: string; confidence: number };

/** Linear-interpolate a sequence of frames to a fixed length so speed differences matter less. */
export function resample(frames: readonly Float32Array[], length = RESAMPLE_LENGTH): Float32Array[] {
  if (frames.length === 0) return [];
  if (frames.length === 1) return Array.from({ length }, () => Float32Array.from(frames[0]));
  const out: Float32Array[] = [];
  for (let i = 0; i < length; i++) {
    const t = (i * (frames.length - 1)) / (length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(frames.length - 1, lo + 1);
    const w = t - lo;
    const f = new Float32Array(frames[lo].length);
    for (let d = 0; d < f.length; d++) f[d] = frames[lo][d] * (1 - w) + frames[hi][d] * w;
    out.push(f);
  }
  return out;
}

function frameDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/** DTW with a Sakoe-Chiba band; returns the average per-step cost along the best path. */
export function dtwDistance(a: readonly Float32Array[], b: readonly Float32Array[], band = Math.ceil(Math.max(a.length, b.length) * 0.25)): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Infinity;
  const w = Math.max(band, Math.abs(n - m));
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Float64Array(m + 1).fill(INF);
  let prevLen = new Uint16Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Float64Array(m + 1).fill(INF);
    const curLen = new Uint16Array(m + 1);
    const jFrom = Math.max(1, i - w);
    const jTo = Math.min(m, i + w);
    for (let j = jFrom; j <= jTo; j++) {
      const cost = frameDistance(a[i - 1], b[j - 1]);
      let best = prev[j - 1];
      let len = prevLen[j - 1];
      if (prev[j] < best) {
        best = prev[j];
        len = prevLen[j];
      }
      if (cur[j - 1] < best) {
        best = cur[j - 1];
        len = curLen[j - 1];
      }
      cur[j] = best + cost;
      curLen[j] = len + 1;
    }
    prev = cur;
    prevLen = curLen;
  }
  return prev[m] / Math.max(1, prevLen[m]);
}

type Prepared = { gloss: string; meaning: string; frames: Float32Array[] };

export class PersonalSignClassifier {
  private prepared: Prepared[] = [];
  /** Distance above which nothing is accepted. Calibrated from the user's own samples. */
  threshold = 0;

  constructor(templates: readonly SignTemplate[] = []) {
    this.setTemplates(templates);
  }

  get glossCount() {
    return new Set(this.prepared.map((p) => p.gloss)).size;
  }

  get sampleCount() {
    return this.prepared.length;
  }

  setTemplates(templates: readonly SignTemplate[]) {
    this.prepared = templates
      .filter((t) => t.frames.length >= 2 && t.frames[0].length === FEATURE_DIM)
      .map((t) => ({ gloss: t.gloss, meaning: t.meaning, frames: resample(t.frames) }));
    this.threshold = this.calibrate();
  }

  /**
   * Threshold = generous multiple of the typical distance between samples of the SAME sign.
   * With fewer than 2 samples of any sign there is no evidence, so a conservative fixed value is used.
   */
  private calibrate(): number {
    const byGloss = new Map<string, Float32Array[][]>();
    for (const p of this.prepared) byGloss.set(p.gloss, [...(byGloss.get(p.gloss) ?? []), p.frames]);
    const intra: number[] = [];
    for (const seqs of byGloss.values()) {
      for (let i = 0; i < seqs.length; i++) for (let j = i + 1; j < seqs.length; j++) intra.push(dtwDistance(seqs[i], seqs[j]));
    }
    if (!intra.length) return 1.5;
    intra.sort((x, y) => x - y);
    const p90 = intra[Math.min(intra.length - 1, Math.floor(intra.length * 0.9))];
    return Math.max(0.6, p90 * 1.6);
  }

  classify(frames: readonly Float32Array[]): Recognition {
    if (!this.prepared.length) return { accepted: false, reason: "NO_TEMPLATES", confidence: 0 };
    if (frames.length < 6) return { accepted: false, reason: "TOO_SHORT", confidence: 0 };
    const seq = resample(frames);
    const bestPerGloss = new Map<string, { d: number; meaning: string }>();
    for (const p of this.prepared) {
      const d = dtwDistance(seq, p.frames);
      const cur = bestPerGloss.get(p.gloss);
      if (!cur || d < cur.d) bestPerGloss.set(p.gloss, { d, meaning: p.meaning });
    }
    const ranked = [...bestPerGloss.entries()].sort((a, b) => a[1].d - b[1].d);
    const [bestGloss, best] = ranked[0];
    const second = ranked[1];
    const absConf = Math.max(0, Math.min(1, 1 - best.d / (this.threshold * 1.25)));
    const marginConf = second ? Math.max(0, Math.min(1, 1 - best.d / second[1].d)) * 2 : 1;
    const confidence = Math.round(Math.min(absConf, Math.min(1, marginConf)) * 100) / 100;

    if (best.d > this.threshold) return { accepted: false, reason: "NO_CLOSE_MATCH", distance: best.d, bestGloss, confidence };
    if (second && best.d / second[1].d > 0.85) return { accepted: false, reason: "AMBIGUOUS", distance: best.d, bestGloss, confidence };
    return { accepted: true, gloss: bestGloss, meaning: best.meaning, confidence, distance: best.d, runnerUp: second?.[0] };
  }
}

/**
 * Splits a continuous stream of frames into candidate sign segments:
 * a segment starts when hands appear and ends when they have been lowered/out of view for a short while.
 */
/**
 * Splits a stream of frames into sign segments: hands appear -> sign -> hands leave.
 *
 * Thresholds are elapsed milliseconds between frames (plus a small frame minimum), so a slow device that manages
 * only a few frames per second segments signs like a fast one. Without timestamps, frames are taken as 50 ms
 * apart (20 fps), which reproduces the original 4 / 7 / 8 / 75-frame behaviour.
 */
export class SignSegmenter {
  private buffer: Float32Array[] = [];
  private active = false;
  private presentFrames = 0;
  private firstPresentAt = 0;
  private lastPresentAt = 0;
  private absentFrames = 0;
  private firstAbsentAt = 0;
  private clock = 0;

  constructor(
    private readonly opts = { startMs: 150, startFrames: 2, endMs: 300, endFrames: 2, minMs: 350, minFrames: 3, maxMs: 3700, maxFrames: 150 },
  ) {}

  get isCapturing() {
    return this.active;
  }

  reset() {
    this.buffer = [];
    this.active = false;
    this.presentFrames = 0;
    this.absentFrames = 0;
  }

  /** Feed one frame (optionally with its timestamp in ms); returns a finished segment when one completes. */
  push(features: Float32Array, nowMs?: number): Float32Array[] | null {
    const now = nowMs ?? (this.clock += 50);
    const present = handsPresent(features) > 0;
    if (!this.active) {
      if (!present) {
        this.reset();
        return null;
      }
      if (this.presentFrames === 0) this.firstPresentAt = now;
      this.presentFrames++;
      this.lastPresentAt = now;
      this.buffer.push(features);
      if (this.presentFrames >= this.opts.startFrames && now - this.firstPresentAt >= this.opts.startMs) {
        this.active = true;
        this.absentFrames = 0;
      }
      return null;
    }
    if (present) {
      this.buffer.push(features);
      this.lastPresentAt = now;
      this.absentFrames = 0;
    } else {
      if (this.absentFrames === 0) this.firstAbsentAt = now;
      this.absentFrames++;
    }
    const ended =
      (this.absentFrames >= this.opts.endFrames && now - this.firstAbsentAt >= this.opts.endMs) ||
      now - this.firstPresentAt >= this.opts.maxMs ||
      this.buffer.length >= this.opts.maxFrames;
    if (!ended) return null;
    const segment = this.buffer;
    const duration = this.lastPresentAt - this.firstPresentAt;
    this.reset();
    return segment.length >= this.opts.minFrames && duration >= this.opts.minMs ? segment : null;
  }
}
