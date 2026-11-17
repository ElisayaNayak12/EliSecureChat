/**
 * Live sign/gesture recognition on a video element, entirely on the device:
 *   camera frame -> MediaPipe Gesture Recognizer -> (a) built-in gestures, debounced
 *                                                -> (b) hand features -> segmentation -> personal DTW classifier
 * Shared by the call screen and the Sign Studio.
 */
import { drawHands, getHandTracker, type HandTracker } from "./handTracker";
import { GestureDebouncer, type GestureFrame, type StableGesture } from "./gestures";
import { frameFeatures, handsPresent, type HandObservation } from "./signFeatures";
import type { IslPrediction, IslRecognizer } from "./islModel";
import { PersonalSignClassifier, SignSegmenter, type Recognition } from "./signRecognizer";

export type SignSessionState = "idle" | "loading" | "running" | "error";
export type LiveReading = { hands: number; gesture: GestureFrame; fps: number };

export type SignSessionCallbacks = {
  onState: (s: SignSessionState, detail?: string) => void;
  /** A personal-sign segment finished (accepted or not). Not called for segments a built-in gesture already covered. */
  onRecognition?: (r: Recognition) => void;
  /** A built-in gesture was held long enough to count. */
  onGesture?: (g: StableGesture) => void;
  /** A trained sign-language model (e.g. ISL) recognised a segment. Rejections are reported too. */
  onModelRecognition?: (r: IslPrediction) => void;
  /** Every frame's feature vector and raw hands (used for recording samples). */
  onFrame?: (features: Float32Array, handCount: number, hands: HandObservation[]) => void;
  /** What the model sees right now, ~4 times a second (for live on-screen feedback). */
  onLive?: (r: LiveReading) => void;
};

const TARGET_FPS = 20;

export class SignSession {
  private tracker: HandTracker | null = null;
  private raf = 0;
  private lastRun = 0;
  private lastLive = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private segmenter = new SignSegmenter();
  private debouncer = new GestureDebouncer();
  private gestureInSegment = false;
  private running = false;
  classifier: PersonalSignClassifier;
  /** When false, frames are still tracked/drawn but nothing is recognised (used while recording samples). */
  recognize = true;
  /** Built-in gesture detection can be switched off independently. */
  gesturesEnabled = true;
  /** Trained sign-language model; when set it is tried first for every completed segment. */
  model: IslRecognizer | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly overlay: HTMLCanvasElement | null,
    private readonly cb: SignSessionCallbacks,
    classifier?: PersonalSignClassifier,
    private readonly mirrored = true,
  ) {
    this.classifier = classifier ?? new PersonalSignClassifier();
  }

  get delegate() {
    return this.tracker?.delegate;
  }

  async start() {
    this.cb.onState("loading", "0%");
    try {
      this.tracker = await getHandTracker((f) => this.cb.onState("loading", `${Math.round(f * 100)}%`));
    } catch (err) {
      this.cb.onState("error", (err as Error).message);
      throw err;
    }
    this.running = true;
    this.fpsWindowStart = performance.now();
    this.cb.onState("running", this.tracker.delegate);
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.segmenter.reset();
    this.debouncer.reset();
    if (this.overlay) this.overlay.getContext("2d")?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.cb.onState("idle");
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastRun < 1000 / TARGET_FPS) return;
    if (!this.tracker || this.video.readyState < 2 || !this.video.videoWidth) return;
    this.lastRun = now;

    let result;
    try {
      result = this.tracker.detect(this.video, now);
    } catch (err) {
      this.running = false;
      this.cb.onState("error", `Hand tracking failed: ${(err as Error).message}`);
      return;
    }
    const { hands, gesture } = result;

    this.frames++;
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsWindowStart));
      this.frames = 0;
      this.fpsWindowStart = now;
    }
    if (this.overlay) {
      if (this.overlay.width !== this.video.videoWidth) {
        this.overlay.width = this.video.videoWidth;
        this.overlay.height = this.video.videoHeight;
      }
      drawHands(this.overlay, hands, this.mirrored);
    }
    const features = frameFeatures(hands);
    const handCount = handsPresent(features);
    this.cb.onFrame?.(features, handCount, hands);
    if (now - this.lastLive > 250) {
      this.lastLive = now;
      this.cb.onLive?.({ hands: handCount, gesture, fps: this.fps });
    }
    if (!this.recognize) return;

    if (this.gesturesEnabled) {
      const stable = this.debouncer.push(gesture, now);
      if (stable) {
        this.gestureInSegment = true;
        this.cb.onGesture?.(stable);
      }
    }
    const segment = this.segmenter.push(features, now);
    if (segment) {
      // A held built-in gesture already produced its message; don't also report it as an unknown personal sign.
      const covered = this.gestureInSegment;
      this.gestureInSegment = false;
      const personal = () => {
        if (!covered || this.classifier.sampleCount > 0) {
          const r = this.classifier.classify(segment);
          if (!covered || r.accepted) this.cb.onRecognition?.(r);
        }
      };
      if (this.model && !covered) {
        const model = this.model;
        void model
          .predict(segment)
          .then((r) => {
            if (r.accepted) this.cb.onModelRecognition?.(r);
            else {
              // Not confident: fall back to the user's personal signs before reporting nothing.
              const p = this.classifier.sampleCount > 0 ? this.classifier.classify(segment) : null;
              if (p?.accepted) this.cb.onRecognition?.(p);
              else this.cb.onModelRecognition?.(r);
            }
          })
          .catch((err: Error) => this.cb.onState("error", `Sign model failed: ${err.message}`));
      } else personal();
    } else if (!this.segmenter.isCapturing && handCount === 0) {
      this.gestureInSegment = false;
    }
  };
}
