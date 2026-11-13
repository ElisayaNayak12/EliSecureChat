/**
 * Built-in hand GESTURES from MediaPipe's pretrained Gesture Recognizer (Apache-2.0).
 *
 * These are 7 universal hand gestures the model was trained on. They are NOT Indian Sign Language
 * signs. Each one is mapped to an English phrase that the user can change in the Translator page.
 * Pure TypeScript (no DOM), unit-tested.
 */

export const GESTURES = ["Thumb_Up", "Thumb_Down", "Open_Palm", "Closed_Fist", "Pointing_Up", "Victory", "ILoveYou"] as const;
export type GestureName = (typeof GESTURES)[number];

export const GESTURE_INFO: Record<GestureName, { emoji: string; label: string; defaultMeaning: string }> = {
  Thumb_Up: { emoji: "👍", label: "Thumbs up", defaultMeaning: "Yes" },
  Thumb_Down: { emoji: "👎", label: "Thumbs down", defaultMeaning: "No" },
  Open_Palm: { emoji: "✋", label: "Open palm", defaultMeaning: "Hello" },
  Closed_Fist: { emoji: "✊", label: "Closed fist", defaultMeaning: "Please wait" },
  Pointing_Up: { emoji: "☝️", label: "Pointing up", defaultMeaning: "One moment" },
  Victory: { emoji: "✌️", label: "Victory", defaultMeaning: "Peace" },
  ILoveYou: { emoji: "🤟", label: "I love you hand", defaultMeaning: "I love you" },
};

export function isGestureName(v: string): v is GestureName {
  return (GESTURES as readonly string[]).includes(v);
}

export type GestureMeanings = Record<GestureName, string>;

export function defaultMeanings(): GestureMeanings {
  return Object.fromEntries(GESTURES.map((g) => [g, GESTURE_INFO[g].defaultMeaning])) as GestureMeanings;
}

/** Accepts stored data of unknown shape; keeps only known gestures with sensible text. */
export function sanitizeMeanings(raw: unknown): GestureMeanings {
  const out = defaultMeanings();
  if (raw && typeof raw === "object") {
    for (const g of GESTURES) {
      const v = (raw as Record<string, unknown>)[g];
      if (typeof v === "string") out[g] = v.trim().slice(0, 120); // "" = gesture disabled
    }
  }
  return out;
}

export type GestureFrame = { name: string; score: number } | null;
export type StableGesture = { gesture: GestureName; score: number };

/**
 * Turns noisy per-frame classifications into single, deliberate events. Time-based, so it behaves the same on a
 * fast laptop (30 fps) and a slow phone (5 fps):
 *  - a gesture must be held for `holdMs` (and at least `minFrames` frames) above `minScore`;
 *  - it fires ONCE, then must be released (another gesture or no hand for `releaseMs`) before it can fire again.
 */
export class GestureDebouncer {
  private candidate: GestureName | null = null;
  private since = 0;
  private frames = 0;
  private scores: number[] = [];
  private fired: GestureName | null = null;
  private releaseSince: number | null = null;

  constructor(private readonly opts = { holdMs: 400, minFrames: 3, releaseMs: 300, minScore: 0.6 }) {}

  reset() {
    this.candidate = null;
    this.frames = 0;
    this.scores = [];
    this.fired = null;
    this.releaseSince = null;
  }

  push(frame: GestureFrame, nowMs: number): StableGesture | null {
    const name = frame && frame.score >= this.opts.minScore && isGestureName(frame.name) ? frame.name : null;

    if (this.fired) {
      if (name === this.fired) {
        this.releaseSince = null;
        return null;
      }
      this.releaseSince ??= nowMs;
      if (nowMs - this.releaseSince < this.opts.releaseMs) return null;
      this.fired = null;
      this.releaseSince = null;
    }

    if (!name) {
      this.candidate = null;
      this.frames = 0;
      this.scores = [];
      return null;
    }
    if (name !== this.candidate) {
      this.candidate = name;
      this.since = nowMs;
      this.frames = 0;
      this.scores = [];
    }
    this.frames++;
    this.scores.push(frame!.score);
    if (this.frames < this.opts.minFrames || nowMs - this.since < this.opts.holdMs) return null;

    const score = Math.round((this.scores.reduce((a, b) => a + b, 0) / this.scores.length) * 100) / 100;
    this.fired = name;
    this.candidate = null;
    this.frames = 0;
    this.scores = [];
    return { gesture: name, score };
  }
}
