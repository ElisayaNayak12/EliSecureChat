/**
 * Validation for WebRTC call signalling and in-call translation payloads.
 * Pure functions so they can be unit-tested without sockets.
 */

export type CallSignalData =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "ice"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export type TranslationSource = "speech" | "sign" | "typed";

/** A caption or translation one participant sends to the other during a call. */
export type TranslationPayload = {
  source: TranslationSource;
  text: string;
  final: boolean;
  /** 0..1 from the producing model, or null when not model-produced (typed text). */
  confidence: number | null;
  gloss?: string[];
  language: string;
  /** Which local engine produced it, e.g. "whisper-tiny.en" or "personal-dtw". Shown to the receiver. */
  engine: string;
  corrected?: boolean;
};

const MAX_SDP = 20_000;

export function parseSignal(data: unknown): CallSignalData | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if ((d.type === "offer" || d.type === "answer") && typeof d.sdp === "string" && d.sdp.length > 0 && d.sdp.length <= MAX_SDP) {
    return { type: d.type, sdp: d.sdp };
  }
  if (d.type === "ice" && typeof d.candidate === "object" && d.candidate !== null) {
    const c = d.candidate as Record<string, unknown>;
    if (typeof c.candidate !== "string" || c.candidate.length > 2000) return null;
    return {
      type: "ice",
      candidate: {
        candidate: c.candidate,
        sdpMid: typeof c.sdpMid === "string" ? c.sdpMid : null,
        sdpMLineIndex: typeof c.sdpMLineIndex === "number" ? c.sdpMLineIndex : null,
      },
    };
  }
  return null;
}

/** What a participant tells the other side when a call connects: which sign language they read (if any). */
export type CallProfile = { signLanguage: string | null };

const SIGN_LANGUAGES = new Set(["isl", "asl", "bsl", "auslan"]);

export function parseProfile(data: unknown): CallProfile | null {
  if (typeof data !== "object" || data === null) return null;
  const v = (data as Record<string, unknown>).signLanguage;
  if (v === null || v === undefined) return { signLanguage: null };
  if (typeof v !== "string" || !SIGN_LANGUAGES.has(v)) return null;
  return { signLanguage: v };
}

export function parseTranslation(data: unknown): TranslationPayload | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "speech" && d.source !== "sign" && d.source !== "typed") return null;
  if (typeof d.text !== "string") return null;
  const text = d.text.trim();
  if (!text || text.length > 500) return null;
  if (typeof d.final !== "boolean") return null;
  let confidence: number | null = null;
  if (d.confidence !== null && d.confidence !== undefined) {
    if (typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) return null;
    confidence = Math.round(d.confidence * 1000) / 1000;
  }
  if (typeof d.language !== "string" || d.language.length > 20) return null;
  if (typeof d.engine !== "string" || !d.engine || d.engine.length > 60) return null;
  let gloss: string[] | undefined;
  if (d.gloss !== undefined) {
    if (!Array.isArray(d.gloss) || d.gloss.length > 20 || !d.gloss.every((g) => typeof g === "string" && g.length <= 60)) return null;
    gloss = d.gloss as string[];
  }
  return {
    source: d.source,
    text,
    final: d.final,
    confidence,
    gloss,
    language: d.language,
    engine: d.engine,
    corrected: d.corrected === true,
  };
}
