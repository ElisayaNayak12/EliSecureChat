import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { AllowOtherUser, CurrentUser, type AuthUser } from "../auth/decorators";
import { InMemoryStore } from "../store/in-memory.store";
import type { DeviceKeyRecord } from "../store/models";

const MAX_DEVICES = 10;
/** Devices not seen for this long stop receiving message keys (a browser that was wiped never comes back). */
const INACTIVE_MS = 30 * 24 * 3600_000;

/** Accepts only an uncompressed P-256 public point: 65 bytes starting with 0x04. */
function isP256Public(b64: unknown): b64 is string {
  if (typeof b64 !== "string" || b64.length > 120) return false;
  try {
    const raw = Buffer.from(b64, "base64");
    return raw.length === 65 && raw[0] === 0x04;
  } catch {
    return false;
  }
}

/** "revoked" = do not encrypt to this device any more (explicitly revoked, or inactive for 30 days). Kept for verifying old signatures. */
const view = (d: DeviceKeyRecord) => ({
  userId: d.userId,
  deviceId: d.deviceId,
  agreementKey: d.agreementKey,
  signingKey: d.signingKey,
  revoked: !!d.revokedAt || Date.now() - Date.parse(d.lastSeenAt) > INACTIVE_MS,
});

/**
 * Public-key directory for end-to-end encryption. It never sees private keys or message keys.
 * A device's keys are immutable: new keys mean a new device id (so key changes are visible to contacts).
 */
@Controller("keys")
export class KeysController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Post("devices")
  @HttpCode(200)
  register(@Body() body: { deviceId?: string; agreementKey?: string; signingKey?: string; label?: string }, @CurrentUser() me: AuthUser) {
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
    if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) throw new BadRequestException("deviceId must be 8-64 characters (letters, digits, hyphens).");
    if (!isP256Public(body.agreementKey) || !isP256Public(body.signingKey)) throw new BadRequestException("Keys must be raw uncompressed P-256 public keys (base64).");
    const existing = this.store.deviceKeys.find((d) => d.deviceId === deviceId);
    const now = new Date().toISOString();
    if (existing) {
      if (existing.userId !== me.userId) throw new ConflictException("DEVICE_ID_TAKEN");
      if (existing.revokedAt) throw new ConflictException("DEVICE_REVOKED");
      if (existing.agreementKey !== body.agreementKey || existing.signingKey !== body.signingKey) throw new ConflictException("DEVICE_KEYS_ARE_IMMUTABLE");
      existing.lastSeenAt = now;
      this.store.persist();
      return view(existing);
    }
    const record: DeviceKeyRecord = {
      userId: me.userId,
      deviceId,
      agreementKey: body.agreementKey,
      signingKey: body.signingKey,
      label: typeof body.label === "string" ? body.label.slice(0, 80) : "Device",
      createdAt: now,
      lastSeenAt: now,
    };
    this.store.deviceKeys.push(record);
    // Cap active devices: the least recently seen ones are revoked.
    const active = this.store.deviceKeys.filter((d) => d.userId === me.userId && !d.revokedAt).sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt));
    for (const d of active.slice(0, Math.max(0, active.length - MAX_DEVICES))) d.revokedAt = now;
    this.store.persist();
    return view(record);
  }

  /** All devices of all members of a chat (membership enforced by the global AccessGuard via :chatId). */
  @Get("chats/:chatId")
  forChat(@Param("chatId") chatId: string) {
    const chat = this.store.chats.find((c) => c.id === chatId);
    if (!chat) throw new NotFoundException("CHAT_NOT_FOUND");
    return this.store.deviceKeys.filter((d) => chat.memberIds.includes(d.userId)).map(view);
  }

  @AllowOtherUser()
  @Get("users/:userId")
  forUser(@Param("userId") userId: string) {
    return this.store.deviceKeys.filter((d) => d.userId === userId).map(view);
  }

  @Delete("devices/:deviceId")
  revoke(@Param("deviceId") deviceId: string, @CurrentUser() me: AuthUser) {
    const d = this.store.deviceKeys.find((x) => x.deviceId === deviceId && x.userId === me.userId);
    if (!d) throw new NotFoundException("DEVICE_NOT_FOUND");
    d.revokedAt = new Date().toISOString();
    this.store.persist();
    return { ok: true };
  }
}
