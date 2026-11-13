/**
 * Tone check: a private, on-device nudge when a message may sound harsh, with a kinder version.
 * Simple rules only (no AI model, nothing leaves the device). It never blocks sending.
 */
const SWAPS: [RegExp, string][] = [
  [/\bthis is (so |really )?(ridiculous|stupid|nonsense|rubbish)\b/gi, "this is frustrating for me"],
  [/\b(you are|you're|ur) (so |really )?(stupid|an idiot|useless|dumb|lazy|pathetic)\b/gi, "I'm upset about this"],
  [/\b(stupid|idiot|idiotic|dumb|useless|pathetic|rubbish)\b/gi, "not great"],
  [/\bshut up\b/gi, "please give me a moment"],
  [/\bi hate (you|this)\b/gi, "I'm really unhappy with this"],
  [/\bwhatever\b/gi, "okay, let's talk later"],
  [/\b(you always|you never)\b/gi, "sometimes it feels like you"],
  [/\bwhy (can't|cant|don't|dont) you ever\b/gi, "could you please try to"],
  [/\bare you (deaf|blind)\b/gi, "did you see my message"],
  [/\bhurry up\b/gi, "could you please be quick"],
  [/\b(do it|reply) now\b/gi, "please $1 when you can"],
];

export type ToneResult = { harsh: boolean; reasons: string[]; kinder: string };

export function checkTone(text: string): ToneResult {
  const t = text.trim();
  const reasons: string[] = [];
  if (t.length < 4) return { harsh: false, reasons, kinder: t };
  const letters = t.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length >= 8 && letters === letters.toUpperCase();
  if (shouting) reasons.push("ALL CAPS can read as shouting");
  if (/[!?]{3,}/.test(t)) reasons.push("lots of !!! can sound angry");
  let kinder = t;
  let swapped = false;
  for (const [re, rep] of SWAPS) {
    const next = kinder.replace(re, rep);
    if (next !== kinder) swapped = true;
    kinder = next;
  }
  if (swapped) reasons.push("some words may hurt");
  if (shouting) kinder = kinder.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
  kinder = kinder.replace(/([!?])\1{2,}/g, "$1");
  if (/^[A-Z]/.test(t)) kinder = kinder.charAt(0).toUpperCase() + kinder.slice(1);
  return { harsh: reasons.length > 0, reasons, kinder };
}
