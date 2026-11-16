/**
 * Reads phone numbers and email addresses from an exported contacts file (vCard .vcf from Google Contacts or an
 * iPhone, or a .csv). Everything happens in the browser; only the numbers/emails are sent to be checked.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{6,18}\d/g;

function cleanPhone(raw: string): string | null {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (t.startsWith("+") ? "+" : "") + digits;
}

export function parseContactsFile(text: string): string[] {
  const out = new Set<string>();
  const isVcard = /BEGIN:VCARD/i.test(text);
  if (isVcard) {
    // Unfold folded lines, then read only TEL and EMAIL properties.
    const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    for (const line of lines) {
      const m = /^(?:item\d+\.)?(TEL|EMAIL)[^:]*:(.*)$/i.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^tel:/i, "").replace(/^mailto:/i, "").trim();
      if (m[1].toUpperCase() === "EMAIL") {
        const e = value.match(EMAIL_RE)?.[0];
        if (e) out.add(e.toLowerCase());
      } else {
        const p = cleanPhone(value);
        if (p) out.add(p);
      }
    }
  } else {
    for (const e of text.match(EMAIL_RE) ?? []) out.add(e.toLowerCase());
    for (const p of text.replace(EMAIL_RE, " ").match(PHONE_RE) ?? []) {
      const c = cleanPhone(p);
      if (c) out.add(c);
    }
  }
  return [...out].slice(0, 2000);
}

/** Phone contact picker (Android Chrome). Returns null where the browser doesn't offer it. */
type PickedContact = { tel?: string[]; email?: string[] };
export function contactPickerSupported(): boolean {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}
export async function pickPhoneContacts(): Promise<string[] | null> {
  if (!contactPickerSupported()) return null;
  const nav = navigator as Navigator & { contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]> } };
  const picked = await nav.contacts.select(["tel", "email"], { multiple: true });
  const out = new Set<string>();
  for (const c of picked) {
    for (const t of c.tel ?? []) {
      const p = cleanPhone(t);
      if (p) out.add(p);
    }
    for (const e of c.email ?? []) out.add(e.trim().toLowerCase());
  }
  return [...out];
}

export function inviteText(appUrl: string): string {
  return `Join me on EliSecureChat: private, end-to-end encrypted chats and video calls, with sign language and captions built in. ${appUrl}`;
}
