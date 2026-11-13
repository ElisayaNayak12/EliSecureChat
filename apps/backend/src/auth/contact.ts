/**
 * Validation of real-world contact details and passwords, shared by sign-up, sign-in and password reset.
 */
import { promises as dns } from "dns";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/** Country used for numbers typed without "+<country code>" (e.g. 98765 43210 in India). */
export const DEFAULT_COUNTRY = ((process.env.DEFAULT_COUNTRY ?? "IN").toUpperCase() as CountryCode);

export type PhoneCheck = { ok: true; e164: string; country?: string; national: string } | { ok: false; reason: string };

/**
 * A real, dialable MOBILE number (SMS-capable) according to Google's libphonenumber numbering-plan data.
 * Returns it in international E.164 form (+919876543210), which is how new accounts store it.
 */
export function checkPhone(raw: unknown, country?: string): PhoneCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "Enter your mobile number." };
  const cc = (typeof country === "string" && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : DEFAULT_COUNTRY) as CountryCode;
  const parsed = parsePhoneNumberFromString(raw.trim(), cc);
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "This is not a valid phone number. Check the country code and the number." };
  const type = parsed.getType();
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
    return { ok: false, reason: "Use a mobile number that can receive SMS (landline, toll-free and premium numbers are not accepted)." };
  }
  return { ok: true, e164: parsed.number, country: parsed.country, national: parsed.formatNational() };
}

/** Comparable form of any stored or typed number (old accounts stored national digits, new ones E.164). */
export function canonicalPhone(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  if (parsed?.isValid()) return parsed.number;
  return trimmed.replace(/[^\d+]/g, "");
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmaill.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.in": "gmail.com", "gmai.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllook.com": "outlook.com", "outlook.con": "outlook.com", "rediffmal.com": "rediffmail.com", "iclod.com": "icloud.com",
};
/** Throwaway inboxes (a short list of the most common ones). */
const DISPOSABLE = new Set(["mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "sharklasers.com"]);

export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Syntax, common typos, throwaway domains, and whether the domain can receive mail at all (DNS MX records).
 * Ownership is proven separately by the emailed code. Set EMAIL_MX_CHECK=off to skip DNS (offline dev/tests).
 */
export async function checkEmail(raw: unknown, resolveMx: (domain: string) => Promise<unknown[]> = (d) => dns.resolveMx(d)): Promise<EmailCheck> {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "Enter your email address." };
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: "This email address is not valid." };
  const domain = email.split("@")[1];
  if (TYPOS[domain]) return { ok: false, reason: `Did you mean ${email.split("@")[0]}@${TYPOS[domain]}?` };
  if (DISPOSABLE.has(domain)) return { ok: false, reason: "Temporary email addresses are not accepted. Use your own email (for example Gmail)." };
  if ((process.env.EMAIL_MX_CHECK ?? "on").toLowerCase() === "off") return { ok: true, email };
  try {
    const records = await Promise.race([resolveMx(domain), new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 4000))]);
    if (!Array.isArray(records) || records.length === 0) return { ok: false, reason: `The domain "${domain}" cannot receive email. Check the address.` };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return { ok: false, reason: `The domain "${domain}" does not exist. Check the address.` };
    // DNS unreachable (offline, firewall): do not block sign-up; the emailed code still proves ownership.
  }
  return { ok: true, email };
}

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "11111111",
  "00000000", "abc12345", "abcd1234", "admin123", "welcome1", "letmein1", "passw0rd", "india123", "test1234", "asdf1234", "1q2w3e4r", "sunshine1",
]);

/** The rules shown to users. Returns the first problem, or null when the password is acceptable. */
export function passwordProblem(password: unknown, context: { name?: string; phone?: string; email?: string } = {}): string | null {
  if (typeof password !== "string" || password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  if (/^(.)\1+$/.test(password)) return "Do not repeat one character.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common. Choose something harder to guess.";
  const digits = (context.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 6 && lower.includes(digits.slice(-6))) return "Do not use your phone number in your password.";
  const local = (context.email ?? "").split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Do not use your email address in your password.";
  const first = (context.name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower.includes(first)) return "Do not use your name in your password.";
  return null;
}

export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, Math.min(2, local.length))}${"•".repeat(Math.min(6, Math.max(1, local.length - 2)))}@${domain}`;
};
/** "+91 ••••• •••89": country code kept, last two digits shown. */
export const maskPhone = (phone: string) => {
  const p = parsePhoneNumberFromString(phone, DEFAULT_COUNTRY);
  if (!p) return `••••${phone.slice(-2)}`;
  const nat = String(p.nationalNumber);
  return `+${p.countryCallingCode} ${"•".repeat(Math.max(0, nat.length - 2))}${nat.slice(-2)}`;
};
