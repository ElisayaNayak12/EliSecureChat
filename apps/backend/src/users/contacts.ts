/**
 * Contact discovery, the WhatsApp/Telegram way: a person only sees other users who are in their own address
 * book (phone numbers / emails they already know) and have joined the app. There is no list of all users.
 *
 * The uploaded address book is used once to find matches and is never stored; only the matches are saved as the
 * person's contacts. A daily limit per account stops anyone from checking huge lists of numbers to find out who
 * uses the app.
 */
import { canonicalPhone } from "../auth/contact";
import type { User } from "../store/models";

export const MAX_ENTRIES_PER_REQUEST = 2000;
export const DAILY_CHECK_LIMIT = Number(process.env.CONTACT_DISCOVERY_DAILY_LIMIT ?? 5000);

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;
const isActive = (u: User) => (u.status ?? "ACTIVE") === "ACTIVE";

/** Turns a raw address-book entry into a matching key: "p:+919876543210" or "e:name@gmail.com". */
export function contactKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 254) return null;
  if (v.includes("@")) return EMAIL.test(v) ? `e:${v.toLowerCase()}` : null;
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const p = canonicalPhone(v);
  return p ? `p:${p}` : null;
}

/** Finds the active users (other than me) whose phone number or email is in the given entries. */
export function matchContacts(users: User[], meId: string, entries: unknown[]) {
  const keys = new Map<string, string>(); // key -> original entry
  for (const e of entries) {
    const k = contactKey(e);
    if (k && !keys.has(k)) keys.set(k, String(e).trim());
  }
  const index = new Map<string, User>();
  for (const u of users) {
    if (u.id === meId || !isActive(u)) continue;
    index.set(`p:${canonicalPhone(u.phone)}`, u);
    if (u.email) index.set(`e:${u.email.toLowerCase()}`, u);
  }
  const matches = new Map<string, User>();
  const notOnApp: string[] = [];
  for (const [k, original] of keys) {
    const u = index.get(k);
    if (u) matches.set(u.id, u);
    else notOnApp.push(original);
  }
  return { checked: keys.size, matches: [...matches.values()], notOnApp };
}

/** Per-account daily budget of distinct entries checked (resets each UTC day; in memory). */
export class DiscoveryBudget {
  private used = new Map<string, { day: string; count: number }>();
  take(userId: string, n: number, limit = DAILY_CHECK_LIMIT): boolean {
    const day = new Date().toISOString().slice(0, 10);
    const cur = this.used.get(userId);
    const count = cur && cur.day === day ? cur.count : 0;
    if (count + n > limit) return false;
    this.used.set(userId, { day, count: count + n });
    return true;
  }
}
