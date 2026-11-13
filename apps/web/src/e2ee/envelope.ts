/**
 * End-to-end encryption envelopes (WebCrypto only; runs in browsers and in Node for tests).
 *
 * Per message:
 *  1. a fresh random 256-bit content key encrypts the plaintext with AES-GCM; the chat, sender and sender device
 *     are bound in as additional authenticated data (so a message cannot be replayed into another chat);
 *  2. the content key is sealed separately for every recipient DEVICE (all members' devices, including the
 *     sender's own) via ECDH P-256 with a one-time ephemeral key + HKDF-SHA256 + AES-GCM;
 *  3. the sender device signs the whole envelope with ECDSA P-256, so the server cannot forge or alter messages.
 *
 * Honest limits: no ratchet (no per-message forward secrecy against a later device-key compromise), and key
 * authenticity relies on users comparing safety codes (the server distributes public keys).
 */

export const ENVELOPE_PREFIX = "e2e1:";
const VERSION = 1;
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const b64 = {
  from(bytes: ArrayBuffer | Uint8Array) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  },
  to(text: string): Uint8Array<ArrayBuffer> {
    const s = atob(text);
    const u = new Uint8Array(new ArrayBuffer(s.length)) as Uint8Array<ArrayBuffer>;
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  },
};

export type DeviceKeys = {
  deviceId: string;
  agreement: CryptoKeyPair; // ECDH P-256, private key non-extractable
  signing: CryptoKeyPair; // ECDSA P-256, private key non-extractable
};

export type PublicDevice = { deviceId: string; userId: string; agreementKey: string; signingKey: string };

export type Envelope = {
  v: number;
  sd: string; // sender device id
  epk: string; // ephemeral ECDH public key (raw, base64)
  salt: string;
  iv: string;
  ct: string;
  keys: Record<string, { iv: string; wk: string }>; // deviceId -> sealed content key
  sig: string;
};

export async function generateDeviceKeys(deviceId: string): Promise<DeviceKeys> {
  const agreement = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const signing = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  return { deviceId, agreement, signing };
}

export async function exportPublic(keys: DeviceKeys) {
  return {
    agreementKey: b64.from(await subtle().exportKey("raw", keys.agreement.publicKey)),
    signingKey: b64.from(await subtle().exportKey("raw", keys.signing.publicKey)),
  };
}

const importAgreementPub = (raw: string) => subtle().importKey("raw", b64.to(raw), { name: "ECDH", namedCurve: "P-256" }, true, []);
const importSigningPub = (raw: string) => subtle().importKey("raw", b64.to(raw), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);

async function wrappingKey(priv: CryptoKey, pub: CryptoKey, salt: Uint8Array<ArrayBuffer>, deviceId: string) {
  const shared = await subtle().deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdf = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode(`sc-e2e-v1:wrap:${deviceId}`) },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const aad = (chatId: string, senderId: string, senderDevice: string) => enc.encode(`sc-e2e-v1|${chatId}|${senderId}|${senderDevice}`);

/** Canonical bytes covered by the signature (key order fixed, device entries sorted). */
function signedBytes(chatId: string, senderId: string, e: Omit<Envelope, "sig">) {
  const keys = Object.keys(e.keys).sort().map((k) => [k, e.keys[k].iv, e.keys[k].wk]);
  return enc.encode(JSON.stringify([e.v, chatId, senderId, e.sd, e.epk, e.salt, e.iv, e.ct, keys]));
}

export async function encryptEnvelope(opts: {
  plaintext: string;
  chatId: string;
  senderId: string;
  sender: DeviceKeys;
  recipients: PublicDevice[];
}): Promise<Envelope> {
  if (!opts.recipients.length) throw new Error("No recipient devices to encrypt for.");
  const contentKeyRaw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const contentKey = await subtle().importKey("raw", contentKeyRaw, "AES-GCM", false, ["encrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(opts.chatId, opts.senderId, opts.sender.deviceId) }, contentKey, enc.encode(opts.plaintext));

  const eph = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const keys: Envelope["keys"] = {};
  for (const r of opts.recipients) {
    const wk = await wrappingKey(eph.privateKey, await importAgreementPub(r.agreementKey), salt, r.deviceId);
    const wiv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    keys[r.deviceId] = { iv: b64.from(wiv), wk: b64.from(await subtle().encrypt({ name: "AES-GCM", iv: wiv }, wk, contentKeyRaw)) };
  }
  contentKeyRaw.fill(0);

  const unsigned: Omit<Envelope, "sig"> = {
    v: VERSION,
    sd: opts.sender.deviceId,
    epk: b64.from(await subtle().exportKey("raw", eph.publicKey)),
    salt: b64.from(salt),
    iv: b64.from(iv),
    ct: b64.from(ct),
    keys,
  };
  const sig = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, opts.sender.signing.privateKey, signedBytes(opts.chatId, opts.senderId, unsigned));
  return { ...unsigned, sig: b64.from(sig) };
}

export type DecryptResult =
  | { ok: true; text: string; verified: boolean }
  | { ok: false; reason: "NOT_FOR_THIS_DEVICE" | "BAD_SIGNATURE" | "DECRYPT_FAILED" | "MALFORMED" };

/**
 * @param senderSigningKey the sender device's public signing key from the key directory, or null if unknown
 *        (then the text is shown but marked unverified).
 */
export async function decryptEnvelope(opts: {
  envelope: Envelope;
  chatId: string;
  senderId: string;
  me: DeviceKeys;
  senderSigningKey: string | null;
}): Promise<DecryptResult> {
  const e = opts.envelope;
  if (!e || e.v !== VERSION || typeof e.ct !== "string" || typeof e.keys !== "object") return { ok: false, reason: "MALFORMED" };
  let verified = false;
  if (opts.senderSigningKey) {
    const { sig, ...unsigned } = e;
    verified = await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, await importSigningPub(opts.senderSigningKey), b64.to(sig), signedBytes(opts.chatId, opts.senderId, unsigned));
    if (!verified) return { ok: false, reason: "BAD_SIGNATURE" };
  }
  const mine = e.keys[opts.me.deviceId];
  if (!mine) return { ok: false, reason: "NOT_FOR_THIS_DEVICE" };
  try {
    const wk = await wrappingKey(opts.me.agreement.privateKey, await importAgreementPub(e.epk), b64.to(e.salt), opts.me.deviceId);
    const contentKeyRaw = await subtle().decrypt({ name: "AES-GCM", iv: b64.to(mine.iv) }, wk, b64.to(mine.wk));
    const contentKey = await subtle().importKey("raw", contentKeyRaw, "AES-GCM", false, ["decrypt"]);
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: b64.to(e.iv), additionalData: aad(opts.chatId, opts.senderId, e.sd) }, contentKey, b64.to(e.ct));
    return { ok: true, text: dec.decode(pt), verified };
  } catch {
    return { ok: false, reason: "DECRYPT_FAILED" };
  }
}

export function serialize(e: Envelope) {
  return ENVELOPE_PREFIX + JSON.stringify(e);
}

export function parse(content: string): Envelope | null {
  if (!content.startsWith(ENVELOPE_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(ENVELOPE_PREFIX.length)) as Envelope;
  } catch {
    return null;
  }
}

/**
 * Safety code for a pair of users, like WhatsApp/Signal: 60 digits (12 groups of 5) derived from both users'
 * device signing keys. Both people see the same code; if it matches, nobody substituted keys.
 */
export async function safetyCode(a: { userId: string; signingKeys: string[] }, b: { userId: string; signingKeys: string[] }) {
  const part = (u: typeof a) => `${u.userId}:${[...u.signingKeys].sort().join(",")}`;
  const canonical = [part(a), part(b)].sort().join("|");
  const digest = new Uint8Array(await subtle().digest("SHA-512", enc.encode(`sc-safety-v1|${canonical}`)));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    let n = 0n;
    for (let j = 0; j < 5; j++) n = (n << 8n) | BigInt(digest[i * 5 + j]);
    groups.push(String(n % 100000n).padStart(5, "0"));
  }
  return groups.join(" ");
}
