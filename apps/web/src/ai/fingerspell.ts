/**
 * Fingerspelling: turns spoken/typed text into a sequence of real hand photos, in the sign language the Deaf
 * person reads (ISL two-handed alphabet with numbers 1-9, or ASL one-handed alphabet).
 *
 * This is letter-by-letter spelling, not full sign translation. Whole signs come from verified human sign
 * videos when the library has them; fingerspelling is the honest fallback that always works for names,
 * places and any word. Photos live in /public/signs/<alphabet>/<CHAR>.jpg (see manifest.json there).
 */

export type SignAlphabet = "isl" | "asl";

export const ALPHABETS: Record<SignAlphabet, { name: string; short: string; chars: Set<string> }> = {
  isl: { name: "Indian Sign Language", short: "ISL", chars: new Set([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."123456789"]) },
  asl: { name: "American Sign Language", short: "ASL", chars: new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") },
};

/** The fingerspelling alphabet we have photos for, for a user's preferred sign language (null = none). */
export function alphabetFor(signLanguage: string | null | undefined): SignAlphabet | null {
  return signLanguage === "isl" || signLanguage === "asl" ? signLanguage : null;
}

export type SpellToken =
  | { kind: "letter"; char: string; word: number; src: string }
  | { kind: "text"; text: string; word: number }
  | { kind: "gap" };

export function signImage(alphabet: SignAlphabet, char: string) {
  return `/signs/${alphabet}/${char}.jpg`;
}

/** Words of the sentence as shown on screen (punctuation kept), aligned with token `word` indexes. */
export function sentenceWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Letters for spellable words; a text card for anything we cannot spell honestly (other scripts, digits
 * without a photo). Punctuation is dropped from the spelling.
 */
export function tokenize(text: string, alphabet: SignAlphabet): SpellToken[] {
  const chars = ALPHABETS[alphabet].chars;
  const out: SpellToken[] = [];
  sentenceWords(text).forEach((word, w) => {
    const clean = word.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (w > 0) out.push({ kind: "gap" });
    if (!clean) {
      if (/\p{L}|\p{N}/u.test(word)) out.push({ kind: "text", text: word, word: w });
      return;
    }
    const spellable = [...clean].every((c) => chars.has(c));
    if (!spellable || clean.length !== word.replace(/[^\p{L}\p{N}]/gu, "").length) {
      out.push({ kind: "text", text: word.replace(/[^\p{L}\p{N}'-]/gu, ""), word: w });
      return;
    }
    for (const c of clean) out.push({ kind: "letter", char: c, word: w, src: signImage(alphabet, c) });
  });
  return out;
}

export type SpellSpeed = "slow" | "normal" | "fast";
export const SPEEDS: Record<SpellSpeed, { label: string; letter: number; gap: number; text: number }> = {
  slow: { label: "Slow", letter: 1000, gap: 650, text: 1700 },
  normal: { label: "Normal", letter: 700, gap: 450, text: 1300 },
  fast: { label: "Fast", letter: 460, gap: 300, text: 900 },
};

export function tokenDuration(t: SpellToken, speed: SpellSpeed) {
  const s = SPEEDS[speed];
  return t.kind === "letter" ? s.letter : t.kind === "gap" ? s.gap : s.text;
}

/** Warms the browser cache so the first letters of a new sentence appear instantly. */
export function preload(tokens: SpellToken[]) {
  for (const t of tokens) if (t.kind === "letter") new Image().src = t.src;
}
