/**
 * Minimal, dependency-free HS256 JWT for access tokens, plus helpers for opaque refresh tokens.
 * Access tokens are short-lived and bound to a device session (sid), which the guard also checks on every
 * request, so revoking a session takes effect immediately even before the token expires.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
const ISSUER = "elisecurechat";

export type AccessClaims = { sub: string; sid: string; iat: number; exp: number; iss: string };

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signAccessToken(secret: Buffer, userId: string, sessionId: string, nowS = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims: AccessClaims = { sub: userId, sid: sessionId, iat: nowS, exp: nowS + ACCESS_TOKEN_TTL_S, iss: ISSUER };
  const payload = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "WRONG_ISSUER" };

export function verifyAccessToken(secret: Buffer, token: string, nowS = Math.floor(Date.now() / 1000)): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "MALFORMED" };
  const [header, payload, sig] = parts;
  let head: { alg?: string };
  try {
    head = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (head.alg !== "HS256") return { ok: false, reason: "MALFORMED" }; // never accept "none" or other algorithms
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "BAD_SIGNATURE" };
  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (claims.iss !== ISSUER) return { ok: false, reason: "WRONG_ISSUER" };
  if (typeof claims.exp !== "number" || claims.exp <= nowS) return { ok: false, reason: "EXPIRED" };
  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") return { ok: false, reason: "MALFORMED" };
  return { ok: true, claims };
}

/** Opaque refresh token: 256 random bits. Only its SHA-256 hash is stored. */
export function newRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Signing secret: JWT_SECRET (required in production, >= 32 chars). In development a random secret is
 * generated once and kept next to the data store, so restarts don't sign everyone out.
 */
export function loadSigningSecret(devSecretPath: string): Buffer {
  const env = process.env.JWT_SECRET;
  if (env) {
    if (env.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
    return Buffer.from(env, "utf8");
  }
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production.");
  if (existsSync(devSecretPath)) return Buffer.from(readFileSync(devSecretPath, "utf8").trim(), "base64url");
  const secret = randomBytes(48);
  mkdirSync(dirname(devSecretPath), { recursive: true });
  writeFileSync(devSecretPath, secret.toString("base64url"), { mode: 0o600 });
  return secret;
}
