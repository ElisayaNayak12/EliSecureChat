/**
 * Pure rules for the consent-based ISL landmark dataset and the trained-model registry
 * (spec sections 6 and 4). Unit-tested; no I/O here.
 *
 * Privacy: samples hold MediaPipe hand landmarks (numbers), never video or images.
 */
import { findSignLanguage } from "../languages/language-packs";
import type { DatasetConsent, SignModelManifest } from "../store/models";

export const CONSENT_VERSION = "signconnect-dataset-consent-v1";
export const FEATURE_VERSION = 1;
export const FEATURE_DIM = 132;
export const MAX_FRAMES = 150;
export const MIN_HAND_FRAMES = 8;

/** Labels only. Each signer performs their own natural ISL sign for the word; nothing here describes how to sign. */
export const STARTER_VOCABULARY: { gloss: string; meaning: string }[] = [
  ["HELLO", "Hello"], ["THANK-YOU", "Thank you"], ["YES", "Yes"], ["NO", "No"], ["PLEASE", "Please"],
  ["SORRY", "Sorry"], ["HELP", "Help"], ["GOOD", "Good"], ["BAD", "Bad"], ["WATER", "Water"],
  ["FOOD", "Food"], ["NAME", "Name"], ["WHAT", "What?"], ["WHERE", "Where?"], ["HOW", "How?"],
  ["WHO", "Who?"], ["WHEN", "When?"], ["WHY", "Why?"], ["UNDERSTAND", "I understand"], ["AGAIN", "Again, please"],
  ["STOP", "Stop"], ["WAIT", "Wait"], ["COME", "Come"], ["GO", "Go"], ["HOME", "Home"],
  ["DOCTOR", "Doctor"], ["TOILET", "Toilet"], ["FINE", "I am fine"], ["MORNING", "Good morning"], ["NIGHT", "Good night"],
].map(([gloss, meaning]) => ({ gloss, meaning }));

export const GLOSS_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,39}$/;

export function normalizeGloss(g: string) {
  return g.trim().toUpperCase().replace(/\s+/g, "-");
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ---------------- consent ---------------- */

export type ConsentInput = Pick<DatasetConsent, "userId" | "signerName" | "language" | "agreeRecording" | "agreeTraining" | "isDeafOrNativeSigner" | "region">;

export function validateConsent(body: unknown): { value?: ConsentInput; issues: string[] } {
  const issues: string[] = [];
  if (!isObj(body)) return { issues: ["Body must be a JSON object."] };
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) issues.push("userId is required.");
  const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
  if (signerName.length < 2 || signerName.length > 80) issues.push("signerName must be 2-80 characters.");
  const language = typeof body.language === "string" ? body.language : "";
  if (!findSignLanguage(language)) issues.push(`language "${language}" is not a known sign-language pack.`);
  if (body.agreeRecording !== true) issues.push("The signer must agree to having their hand movements recorded (agreeRecording).");
  if (body.agreeTraining !== true) issues.push("The signer must agree to the recordings being used to train recognition models (agreeTraining).");
  const region = typeof body.region === "string" && body.region.trim() ? body.region.trim().slice(0, 80) : undefined;
  if (issues.length) return { issues };
  return {
    issues,
    value: { userId, signerName, language, agreeRecording: true, agreeTraining: true, isDeafOrNativeSigner: body.isDeafOrNativeSigner === true, region },
  };
}

/* ---------------- samples ---------------- */

export type RawHand = { h: "L" | "R"; s: number; p: number[] };
export type RawFrame = { t: number; hands: RawHand[] };

export type SampleInput = { consentId: string; gloss: string; language: string; frames: RawFrame[] };

/**
 * Validates a recorded sign: 8-150 frames, increasing timestamps, up to two hands per frame,
 * each hand 21 landmarks x (x, y, z) of finite, plausible numbers, and enough frames with hands visible.
 */
export function validateSample(body: unknown): { value?: SampleInput & { durationMs: number; handFrameRatio: number }; issues: string[] } {
  const issues: string[] = [];
  if (!isObj(body)) return { issues: ["Body must be a JSON object."] };
  const consentId = typeof body.consentId === "string" ? body.consentId : "";
  if (!consentId) issues.push("consentId is required.");
  const gloss = typeof body.gloss === "string" ? normalizeGloss(body.gloss) : "";
  if (!GLOSS_PATTERN.test(gloss)) issues.push("gloss must be 1-40 characters: letters, digits and hyphens.");
  const language = typeof body.language === "string" ? body.language : "";
  if (!findSignLanguage(language)) issues.push(`language "${language}" is not a known sign-language pack.`);
  const frames = body.frames;
  if (!Array.isArray(frames) || frames.length < MIN_HAND_FRAMES || frames.length > MAX_FRAMES) {
    issues.push(`frames must be an array of ${MIN_HAND_FRAMES}-${MAX_FRAMES} frames.`);
    return { issues };
  }
  let lastT = -Infinity;
  let withHands = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!isObj(f) || typeof f.t !== "number" || !Number.isFinite(f.t) || f.t < lastT || !Array.isArray(f.hands) || f.hands.length > 2) {
      issues.push(`frame ${i} is malformed (needs increasing t and at most 2 hands).`);
      break;
    }
    lastT = f.t;
    let bad = false;
    for (const h of f.hands as unknown[]) {
      if (!isObj(h) || (h.h !== "L" && h.h !== "R") || typeof h.s !== "number" || h.s < 0 || h.s > 1 || !Array.isArray(h.p) || h.p.length !== 63
        || !h.p.every((v) => typeof v === "number" && Number.isFinite(v) && v > -2 && v < 3)) {
        bad = true;
        break;
      }
    }
    if (bad) {
      issues.push(`frame ${i} has an invalid hand (need h L/R, s 0-1, p = 63 numbers).`);
      break;
    }
    if ((f.hands as unknown[]).length > 0) withHands++;
  }
  if (!issues.length && withHands < MIN_HAND_FRAMES) issues.push(`at least ${MIN_HAND_FRAMES} frames must contain a hand (got ${withHands}).`);
  if (issues.length) return { issues };
  const typed = frames as RawFrame[];
  return {
    issues,
    value: {
      consentId, gloss, language, frames: typed,
      durationMs: Math.round(typed[typed.length - 1].t - typed[0].t),
      handFrameRatio: Math.round((withHands / typed.length) * 100) / 100,
    },
  };
}

/* ---------------- model manifest ---------------- */

export function validateManifest(raw: unknown): { value?: SignModelManifest; issues: string[] } {
  const issues: string[] = [];
  if (!isObj(raw)) return { issues: ["manifest must be a JSON object."] };
  const m = raw as Partial<SignModelManifest> & Record<string, unknown>;
  if (m.task !== "SIGN_RECOGNITION") issues.push('task must be "SIGN_RECOGNITION".');
  if (typeof m.language !== "string" || !findSignLanguage(m.language)) issues.push("language must be a known sign-language pack.");
  if (typeof m.version !== "string" || !m.version) issues.push("version is required.");
  if (typeof m.architecture !== "string" || !m.architecture) issues.push("architecture is required.");
  if (m.featureVersion !== FEATURE_VERSION) issues.push(`featureVersion must be ${FEATURE_VERSION} (the app's landmark feature format).`);
  if (m.featureDim !== FEATURE_DIM) issues.push(`featureDim must be ${FEATURE_DIM}.`);
  if (typeof m.sequenceLength !== "number" || m.sequenceLength < 8 || m.sequenceLength > 128) issues.push("sequenceLength must be 8-128.");
  if (!Array.isArray(m.labels) || m.labels.length < 2 || !m.labels.every((l) => isObj(l) && typeof l.gloss === "string" && typeof l.meaning === "string")) {
    issues.push("labels must list at least 2 { gloss, meaning } entries.");
  }
  if (typeof m.threshold !== "number" || m.threshold <= 0 || m.threshold >= 1) issues.push("threshold must be between 0 and 1.");
  const met = m.metrics as SignModelManifest["metrics"] | undefined;
  if (!isObj(met) || typeof met.signerIndependent !== "boolean" || typeof met.trainSamples !== "number" || typeof met.signers !== "number") {
    issues.push("metrics must include signerIndependent, trainSamples and signers (honest evaluation is required).");
  }
  if (typeof m.trainedAt !== "string") issues.push("trainedAt is required.");
  return issues.length ? { issues } : { issues, value: m as SignModelManifest };
}
