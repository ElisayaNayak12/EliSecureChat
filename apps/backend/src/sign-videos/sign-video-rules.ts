/**
 * Pure rules for the human sign-video library (spec section 5.6).
 *  - Only VERIFIED recordings are ever served for translation.
 *  - A caption matches a recording only when the WHOLE normalised sentence equals the recording's phrase.
 *  - Clips are never concatenated to build a sentence; no match means an explicit fallback.
 */
import { findSignLanguage } from "../languages/language-packs";
import type { SignVideo, SignVideoUnit } from "../store/models";

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const UNITS: SignVideoUnit[] = ["SENTENCE", "PHRASE", "SIGN"];
const QUALITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’']/g, "") // don't -> dont
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SignVideoInput = Pick<
  SignVideo,
  "signLanguageId" | "unit" | "phraseText" | "gloss" | "meaning" | "signerId" | "region" | "quality" | "license" | "provenance" | "consentConfirmed" | "uploadedBy"
>;

function str(v: unknown, field: string, issues: string[], max = 300, required = true): string {
  if (typeof v !== "string" || !v.trim()) {
    if (required) issues.push(`${field} is required.`);
    return "";
  }
  const t = v.trim();
  if (t.length > max) issues.push(`${field} must be at most ${max} characters.`);
  return t;
}

/** Validates multipart text fields. Returns issues instead of throwing so every problem is reported. */
export function validateSignVideoFields(body: Record<string, unknown>): { value?: SignVideoInput; issues: string[] } {
  const issues: string[] = [];
  const signLanguageId = str(body.signLanguageId, "signLanguageId", issues, 20);
  if (signLanguageId && !findSignLanguage(signLanguageId)) issues.push(`signLanguageId "${signLanguageId}" is not a known sign-language pack.`);
  const unit = body.unit as SignVideoUnit;
  if (!UNITS.includes(unit)) issues.push(`unit must be one of ${UNITS.join(", ")}.`);
  const phraseText = str(body.phraseText, "phraseText", issues, 300);
  if (phraseText && !normalizePhrase(phraseText)) issues.push("phraseText must contain words.");
  const gloss = str(body.gloss, "gloss", issues, 300);
  const meaning = str(body.meaning, "meaning", issues, 500);
  const signerId = str(body.signerId, "signerId", issues, 80);
  const region = str(body.region, "region", issues, 80, false);
  const quality = (body.quality ?? "MEDIUM") as (typeof QUALITIES)[number];
  if (!QUALITIES.includes(quality)) issues.push(`quality must be one of ${QUALITIES.join(", ")}.`);
  const license = str(body.license, "license", issues, 200);
  const provenance = str(body.provenance, "provenance", issues, 500);
  const uploadedBy = str(body.uploadedBy, "uploadedBy", issues, 60);
  const consentConfirmed = body.consentConfirmed === true || body.consentConfirmed === "true";
  if (!consentConfirmed) issues.push("consentConfirmed must be true: the signer must have consented to recording and use.");
  if (issues.length) return { issues };
  return {
    issues,
    value: { signLanguageId, unit, phraseText, gloss, meaning, signerId, region: region || undefined, quality, license, provenance, consentConfirmed, uploadedBy },
  };
}

export type LookupResult =
  | { match: SignVideo; reason: "EXACT_VERIFIED_MATCH" }
  | { match: null; reason: "NO_VERIFIED_VIDEO_FOR_SENTENCE" | "LANGUAGE_HAS_NO_VERIFIED_VIDEOS" | "EMPTY_TEXT" };

const UNIT_RANK: Record<SignVideoUnit, number> = { SENTENCE: 0, PHRASE: 1, SIGN: 2 };
const QUALITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export function lookupSignVideo(library: readonly SignVideo[], signLanguageId: string, text: string): LookupResult {
  const needle = normalizePhrase(text);
  if (!needle) return { match: null, reason: "EMPTY_TEXT" };
  const verified = library.filter((v) => v.signLanguageId === signLanguageId && v.verificationStatus === "VERIFIED");
  if (verified.length === 0) return { match: null, reason: "LANGUAGE_HAS_NO_VERIFIED_VIDEOS" };
  const candidates = verified
    .filter((v) => v.normalizedPhrase === needle)
    .sort((a, b) => UNIT_RANK[a.unit] - UNIT_RANK[b.unit] || QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality]);
  return candidates[0] ? { match: candidates[0], reason: "EXACT_VERIFIED_MATCH" } : { match: null, reason: "NO_VERIFIED_VIDEO_FOR_SENTENCE" };
}
