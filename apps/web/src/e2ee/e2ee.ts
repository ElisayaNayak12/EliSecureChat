/**
 * Client end-to-end encryption service.
 *  - This device's keys are created once and stored in IndexedDB. Private keys are non-extractable CryptoKeys,
 *    so even code running on this page cannot export them.
 *  - Public keys are registered in the server's directory; messages are encrypted for every device of every
 *    chat member and signed by this device (see envelope.ts).
 *  - Decryption runs in the background; components read results synchronously via view().
 */
import { api } from "../api";
import { decryptEnvelope, encryptEnvelope, exportPublic, generateDeviceKeys, parse, safetyCode, serialize, type DeviceKeys, type PublicDevice } from "./envelope";

export type DirectoryDevice = PublicDevice & { revoked: boolean };
type StoredKeys = { userId: string; keys: DeviceKeys; retired?: DeviceKeys[] };
export type MessageView = { text: string; state: "legacy" | "verified" | "unverified" | "pending" | "unreadable" | "rejected" };

export class MissingKeysError extends Error {
  constructor(readonly userIds: string[]) {
    super("Some chat members have not set up encryption yet.");
  }
}

const DB = "signconnect-e2ee";
const STORE = "devices";

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "userId" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    };
  });
}

function legacyDecode(content: string) {
  try {
    return decodeURIComponent(escape(atob(content)));
  } catch {
    return "[Unreadable message]";
  }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : "Linux";
  return `${b} on ${os}`;
}

class E2EEService {
  /** This device's keys. `retired` holds earlier keys of this browser (after a revoke) so old messages stay readable. */
  private me: StoredKeys | null = null;
  private initPromise: Promise<void> | null = null;
  private results = new Map<string, MessageView>(); // keyed by envelope content
  private inflight = new Set<string>();
  private chatDevices = new Map<string, { at: number; devices: DirectoryDevice[] }>();
  private listeners = new Set<() => void>();
  version = 0;

  get ready() {
    return !!this.me;
  }

  get deviceId() {
    return this.me?.keys.deviceId ?? null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Loads (or creates) this device's keys for the user and registers the public half with the server. */
  init(userId: string): Promise<void> {
    if (this.me?.userId === userId) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!globalThis.crypto?.subtle || !("indexedDB" in globalThis)) throw new Error("This browser does not support secure key storage.");
      let stored = await idb<StoredKeys | undefined>("readonly", (s) => s.get(userId) as IDBRequest<StoredKeys | undefined>);
      if (!stored) {
        const keys = await generateDeviceKeys(crypto.randomUUID());
        stored = { userId, keys };
        await idb("readwrite", (s) => s.put(stored));
      }
      const register = async (keys: DeviceKeys) =>
        api.registerDeviceKeys({ deviceId: keys.deviceId, label: deviceLabel(), ...(await exportPublic(keys)) });
      try {
        await register(stored.keys);
      } catch (err) {
        // This device was signed out remotely or pushed out by the device limit: start a fresh device identity
        // (contacts see a "security code changed" notice). Old keys stay on this device for reading history.
        if (!/DEVICE_REVOKED|DEVICE_ID_TAKEN/.test((err as Error).message)) throw err;
        const fresh: StoredKeys = { userId, keys: await generateDeviceKeys(crypto.randomUUID()), retired: [...(stored.retired ?? []), stored.keys].slice(-5) };
        await idb("readwrite", (s) => s.put(fresh));
        await register(fresh.keys);
        stored = fresh;
      }
      this.me = stored;
      this.results.clear();
      this.bump();
    })().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  reset() {
    this.me = null;
    this.results.clear();
    this.chatDevices.clear();
    this.bump();
  }

  private async devicesFor(chatId: string, maxAgeMs = 30_000) {
    const hit = this.chatDevices.get(chatId);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.devices;
    const devices = (await api.chatDeviceKeys(chatId)) as DirectoryDevice[];
    this.chatDevices.set(chatId, { at: Date.now(), devices });
    this.noteKeyChanges(chatId, devices);
    return devices;
  }

  /** Encrypts for every active device of every member. Refuses (never falls back to plaintext) if a member has no keys. */
  async encryptFor(chatId: string, memberIds: string[], plaintext: string): Promise<string> {
    if (!this.me) throw new Error("Encryption is not ready on this device.");
    const devices = (await this.devicesFor(chatId, 0)).filter((d) => !d.revoked);
    const missing = memberIds.filter((id) => id !== this.me!.userId && !devices.some((d) => d.userId === id));
    if (missing.length) throw new MissingKeysError(missing);
    const recipients = devices.some((d) => d.deviceId === this.me!.keys.deviceId)
      ? devices
      : [...devices, { deviceId: this.me.keys.deviceId, userId: this.me.userId, ...(await exportPublic(this.me.keys)), revoked: false }];
    const env = await encryptEnvelope({ plaintext, chatId, senderId: this.me.userId, sender: this.me.keys, recipients });
    const content = serialize(env);
    this.results.set(content, { text: plaintext, state: "verified" }); // our own message
    return content;
  }

  /** Synchronous read for rendering. */
  view(content: string): MessageView {
    if (!parse(content)) return { text: legacyDecode(content), state: "legacy" };
    return this.results.get(content) ?? { text: "🔒 Decrypting…", state: "pending" };
  }

  /** Decrypts any not-yet-seen envelopes in the background, then notifies subscribers. */
  async decryptAll(messages: { chatId: string; senderId: string; encryptedContent: string }[]) {
    if (!this.me) return;
    const todo = messages.filter((m) => parse(m.encryptedContent) && !this.results.has(m.encryptedContent) && !this.inflight.has(m.encryptedContent));
    if (!todo.length) return;
    for (const m of todo) this.inflight.add(m.encryptedContent);
    try {
      for (const m of todo) {
        const env = parse(m.encryptedContent)!;
        let devices = await this.devicesFor(m.chatId);
        let sender = devices.find((d) => d.deviceId === env.sd && d.userId === m.senderId);
        if (!sender) {
          devices = await this.devicesFor(m.chatId, 0); // a new device may have joined since we cached
          sender = devices.find((d) => d.deviceId === env.sd && d.userId === m.senderId);
        }
        const mine = env.keys[this.me.keys.deviceId] ? this.me.keys : ((this.me.retired ?? []).find((k) => env.keys[k.deviceId]) ?? this.me.keys);
        const r = await decryptEnvelope({ envelope: env, chatId: m.chatId, senderId: m.senderId, me: mine, senderSigningKey: sender?.signingKey ?? null });
        this.results.set(
          m.encryptedContent,
          r.ok
            ? { text: r.text, state: r.verified ? "verified" : "unverified" }
            : r.reason === "NOT_FOR_THIS_DEVICE"
              ? { text: "🔒 This message was sent before this device was set up, so it can't be read here.", state: "unreadable" }
              : { text: "⚠️ This message failed its security check and was hidden.", state: "rejected" },
        );
      }
    } finally {
      for (const m of todo) this.inflight.delete(m.encryptedContent);
      this.bump();
    }
  }

  /** 60-digit code to compare with the other person (same on both phones if nobody swapped keys). */
  async safetyCodeFor(chatId: string, peerId: string) {
    if (!this.me) return null;
    const devices = await this.devicesFor(chatId, 0);
    const keysOf = (uid: string) => devices.filter((d) => d.userId === uid && !d.revoked).map((d) => d.signingKey);
    return safetyCode({ userId: this.me.userId, signingKeys: keysOf(this.me.userId) }, { userId: peerId, signingKeys: keysOf(peerId) });
  }

  /** WhatsApp-style "security code changed" notices: remembers which peer devices this user has seen. */
  keyChangeNotices = new Map<string, string>(); // chatId -> notice

  private noteKeyChanges(chatId: string, devices: DirectoryDevice[]) {
    if (!this.me) return;
    const key = `e2ee-seen:${this.me.userId}:${chatId}`;
    const peers = devices.filter((d) => d.userId !== this.me!.userId && !d.revoked).map((d) => d.deviceId).sort();
    let previous: string[] | null = null;
    try {
      previous = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      previous = null;
    }
    if (previous && peers.some((d) => !previous!.includes(d))) {
      this.keyChangeNotices.set(chatId, "The other person's security code changed (new device or reinstall). Compare security codes if you want to be sure.");
    }
    try {
      localStorage.setItem(key, JSON.stringify(peers));
    } catch {
      /* storage unavailable: notices just won't persist */
    }
  }
}

export const e2ee = new E2EEService();
// Dev-only handle for end-to-end tests and debugging (never in production builds).
if (import.meta.env.DEV) (window as unknown as { __e2ee?: E2EEService }).__e2ee = e2ee;
