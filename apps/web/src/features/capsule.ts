/**
 * Time-capsule messages: the text is end-to-end encrypted like any message, and the app keeps it sealed
 * until the chosen date. Format inside the encrypted text: "::capsule:YYYY-MM-DD::message".
 * Honest limits: the sealed text is already on the recipient's device; the app (not cryptography) hides it.
 */
const RE = /^::capsule:(\d{4}-\d{2}-\d{2})::([\s\S]{1,4000})$/;

export const capsuleText = (date: string, text: string) => `::capsule:${date}::${text}`;

export type Capsule = { opensOn: string; text: string; open: boolean };

export function parseCapsule(text: string | null | undefined, now = new Date()): Capsule | null {
  const m = RE.exec(text ?? "");
  if (!m) return null;
  const opens = new Date(`${m[1]}T00:00:00`);
  if (Number.isNaN(+opens)) return null;
  return { opensOn: m[1], text: m[2], open: now >= opens };
}

export const formatOpenDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export function capsuleLabel(text: string): string | null {
  const c = parseCapsule(text);
  if (!c) return null;
  return c.open ? `Time capsule · ${c.text.slice(0, 48)}` : `Time capsule · opens ${formatOpenDate(c.opensOn)}`;
}
