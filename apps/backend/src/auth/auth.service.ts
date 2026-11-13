import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { InMemoryStore } from "../store/in-memory.store";
import type { DeviceSession, User } from "../store/models";
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_S, hashToken, loadSigningSecret, newRefreshToken, signAccessToken, verifyAccessToken } from "./tokens";

export type IssuedSession = { accessToken: string; refreshToken: string; sessionId: string; expiresIn: number };

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  private secret: Buffer | null = null;
  private readonly failedLogins = new Map<string, { count: number; until: number }>();

  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  private get key() {
    this.secret ??= loadSigningSecret(join(dirname(this.store.storeFilePath), ".jwt-secret"));
    return this.secret;
  }

  /* ---------------- sessions ---------------- */

  issue(user: User, device: string): IssuedSession {
    const now = new Date();
    const refreshToken = newRefreshToken();
    const session: DeviceSession = {
      id: randomUUID(),
      userId: user.id,
      familyId: randomUUID(),
      refreshHash: hashToken(refreshToken),
      previousHashes: [],
      device: device.slice(0, 160) || "Unknown device",
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000).toISOString(),
    };
    this.pruneSessions(user.id);
    this.store.sessions.push(session);
    this.store.persist();
    return { accessToken: signAccessToken(this.key, user.id, session.id), refreshToken, sessionId: session.id, expiresIn: ACCESS_TOKEN_TTL_S };
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (token theft). */
  refresh(refreshToken: string): { user: User; issued: IssuedSession } | { error: "INVALID" | "REUSED" | "EXPIRED" | "SUSPENDED" } {
    const hash = hashToken(refreshToken);
    const session = this.store.sessions.find((s) => s.refreshHash === hash);
    if (!session) {
      const stolen = this.store.sessions.find((s) => s.previousHashes.includes(hash));
      if (stolen) {
        this.revokeFamily(stolen.familyId, "REFRESH_TOKEN_REUSE");
        return { error: "REUSED" };
      }
      return { error: "INVALID" };
    }
    if (session.revokedAt) return { error: "INVALID" };
    if (Date.parse(session.expiresAt) <= Date.now()) {
      session.revokedAt = new Date().toISOString();
      session.revokedReason = "EXPIRED";
      this.store.persist();
      return { error: "EXPIRED" };
    }
    const user = this.store.users.find((u) => u.id === session.userId);
    if (!user || (user.status ?? "ACTIVE") !== "ACTIVE") return { error: "SUSPENDED" };
    const next = newRefreshToken();
    session.previousHashes = [...session.previousHashes, session.refreshHash].slice(-20);
    session.refreshHash = hashToken(next);
    session.lastUsedAt = new Date().toISOString();
    this.store.persist();
    return { user, issued: { accessToken: signAccessToken(this.key, user.id, session.id), refreshToken: next, sessionId: session.id, expiresIn: ACCESS_TOKEN_TTL_S } };
  }

  /** Verifies an access token AND that its session is still live and the user active. */
  authenticate(accessToken: string): { userId: string; sessionId: string } | null {
    const v = verifyAccessToken(this.key, accessToken);
    if (!v.ok) return null;
    const session = this.store.sessions.find((s) => s.id === v.claims.sid);
    if (!session || session.revokedAt || session.userId !== v.claims.sub) return null;
    const user = this.store.users.find((u) => u.id === v.claims.sub);
    if (!user || (user.status ?? "ACTIVE") !== "ACTIVE") return null;
    return { userId: user.id, sessionId: session.id };
  }

  revoke(sessionId: string, reason: string) {
    const s = this.store.sessions.find((x) => x.id === sessionId);
    if (s && !s.revokedAt) {
      s.revokedAt = new Date().toISOString();
      s.revokedReason = reason;
      this.store.persist();
    }
  }

  revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    for (const s of this.store.sessions) {
      if (s.userId === userId && !s.revokedAt && s.id !== exceptSessionId) {
        s.revokedAt = new Date().toISOString();
        s.revokedReason = reason;
      }
    }
    this.store.persist();
  }

  private revokeFamily(familyId: string, reason: string) {
    for (const s of this.store.sessions) {
      if (s.familyId === familyId && !s.revokedAt) {
        s.revokedAt = new Date().toISOString();
        s.revokedReason = reason;
      }
    }
    this.store.persist();
  }

  activeSessions(userId: string) {
    const now = Date.now();
    return this.store.sessions.filter((s) => s.userId === userId && !s.revokedAt && Date.parse(s.expiresAt) > now);
  }

  /** Keeps the store small: drop sessions dead for 30+ days, and cap live sessions per user at 10 (oldest revoked). */
  private pruneSessions(userId: string) {
    const cutoff = Date.now() - 30 * 86400_000;
    this.store.sessions = this.store.sessions.filter((s) => !(s.revokedAt && Date.parse(s.revokedAt) < cutoff));
    const live = this.activeSessions(userId).sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt));
    for (const s of live.slice(0, Math.max(0, live.length - 9))) {
      s.revokedAt = new Date().toISOString();
      s.revokedReason = "SESSION_LIMIT";
    }
  }

  /* ---------------- brute-force protection ---------------- */

  isLockedOut(key: string) {
    const f = this.failedLogins.get(key);
    return !!f && f.until > Date.now();
  }

  recordFailure(key: string) {
    const f = this.failedLogins.get(key) ?? { count: 0, until: 0 };
    f.count++;
    if (f.count >= MAX_FAILED_LOGINS) {
      f.until = Date.now() + LOCKOUT_MS;
      f.count = 0;
    }
    this.failedLogins.set(key, f);
  }

  clearFailures(key: string) {
    this.failedLogins.delete(key);
  }

}
