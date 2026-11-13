/**
 * Private Vault: hide chosen chats from the chat list behind a PIN on this device. A second "decoy" PIN
 * opens an empty vault, for when someone forces you to unlock it.
 * Stored on this device only (PINs are salted SHA-256 hashes). Messages stay end-to-end encrypted as usual;
 * the vault hides chats from view, it is not an extra layer of encryption.
 */
type VaultState = { salt: string; pin: string; decoy: string | null; chatIds: string[] };

const key = (userId: string) => `vault:${userId}`;

async function hash(pin: string, salt: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function load(userId: string): VaultState | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as VaultState) : null;
  } catch {
    return null;
  }
}

function save(userId: string, v: VaultState) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(v));
  } catch {
    // storage unavailable: vault cannot be used in this browser mode
  }
}

export const vaultExists = (userId: string) => load(userId) !== null;
export const hiddenChatIds = (userId: string) => new Set(load(userId)?.chatIds ?? []);

export async function createVault(userId: string, pin: string, decoy: string | null) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  save(userId, { salt, pin: await hash(pin, salt), decoy: decoy ? await hash(decoy, salt) : null, chatIds: [] });
}

/** "real" = the vault opens; "decoy" = show an empty vault; "wrong" = no match. */
export async function unlockVault(userId: string, pin: string): Promise<"real" | "decoy" | "wrong"> {
  const v = load(userId);
  if (!v) return "wrong";
  const h = await hash(pin, v.salt);
  if (h === v.pin) return "real";
  if (v.decoy && h === v.decoy) return "decoy";
  return "wrong";
}

export function setChatHidden(userId: string, chatId: string, hidden: boolean) {
  const v = load(userId);
  if (!v) return;
  const ids = new Set(v.chatIds);
  if (hidden) ids.add(chatId);
  else ids.delete(chatId);
  save(userId, { ...v, chatIds: [...ids] });
}

export function deleteVault(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // ignore
  }
}

export const pinProblem = (pin: string) => (/^\d{4,8}$/.test(pin) ? null : "Use 4 to 8 digits.");
