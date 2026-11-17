/**
 * Client session: the access token lives ONLY in memory (never localStorage), so injected scripts cannot steal
 * a long-lived credential. Access tokens are renewed shortly before they expire, and on any 401.
 *
 * Refresh token:
 *  - Web: an httpOnly cookie the page cannot read.
 *  - Token test mode (VITE_AUTH_MODE=native): sent in the request body, like the Flutter app does.
 */
import type { User } from "./types";
import { API_URL, USE_NATIVE_AUTH } from "./config";

type SessionResponse = { user: User; accessToken: string; expiresIn: number; sessionId: string; refreshToken?: string };

const REFRESH_KEY = "sc_refresh_token";

/** Token test mode keeps the refresh token in sessionStorage (testing only; never used by normal web builds). */
const tokenStore = {
  async get(): Promise<string | null> {
    try {
      return sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string) {
    try {
      sessionStorage.setItem(REFRESH_KEY, token);
    } catch {
      /* storage unavailable: the session will not survive a restart */
    }
  },
  async clear() {
    try {
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};
let pendingStore: Promise<unknown> = Promise.resolve();

/** Fields to add to sign-in / sign-up so a native client receives its refresh token in the response body. */
export function clientAuthFields(): { client?: "native" } {
  return USE_NATIVE_AUTH ? { client: "native" } : {};
}

let accessToken: string | null = null;
let sessionId: string | null = null;
let refreshTimer: number | undefined;
let inflight: Promise<SessionResponse | null> | null = null;
const listeners = new Set<(s: { token: string | null; user?: User }) => void>();

export function getAccessToken() {
  return accessToken;
}

export function getSessionId() {
  return sessionId;
}

/** Subscribe to token changes (sign-in, refresh, sign-out). */
export function onSessionChange(fn: (s: { token: string | null; user?: User }) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(user?: User) {
  for (const l of listeners) l({ token: accessToken, user });
}

export function setSession(res: SessionResponse) {
  accessToken = res.accessToken;
  sessionId = res.sessionId;
  if (USE_NATIVE_AUTH && res.refreshToken) {
    const token = res.refreshToken;
    pendingStore = pendingStore.then(() => tokenStore.set(token)).catch(() => undefined);
  }
  window.clearTimeout(refreshTimer);
  // Renew a minute before expiry (or halfway for very short tokens).
  const inMs = Math.max(10_000, Math.min(res.expiresIn * 1000 - 60_000, res.expiresIn * 500));
  refreshTimer = window.setTimeout(() => void refreshSession(), inMs);
  emit(res.user);
}

export function clearSession() {
  accessToken = null;
  sessionId = null;
  window.clearTimeout(refreshTimer);
  emit();
}

/** Single-flight refresh (cookie on the web, stored token in the apps). Resolves null when there is no valid session. */
export function refreshSession(): Promise<SessionResponse | null> {
  inflight ??= (async () => {
    try {
      let payload = "{}";
      if (USE_NATIVE_AUTH) {
        await pendingStore;
        const refreshToken = await tokenStore.get();
        if (!refreshToken) {
          clearSession();
          return null;
        }
        payload = JSON.stringify({ client: "native", refreshToken });
      }
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: payload });
      if (!res.ok) {
        if (USE_NATIVE_AUTH && res.status === 401) await tokenStore.clear();
        clearSession();
        return null;
      }
      const body = (await res.json()) as SessionResponse;
      setSession(body);
      return body;
    } catch {
      return null; // network error: keep the current token; the next request will retry
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function logoutSession() {
  try {
    let body = "{}";
    if (USE_NATIVE_AUTH) {
      await pendingStore;
      body = JSON.stringify({ client: "native", refreshToken: await tokenStore.get() });
    }
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body });
  } finally {
    if (USE_NATIVE_AUTH) await tokenStore.clear().catch(() => undefined);
    clearSession();
  }
}

/** Media URLs (<img>, <video>) cannot send headers; append the short-lived access token. */
export function withMediaToken(url: string) {
  if (!accessToken || !/\/api\/(uploads|sign-videos)\//.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
}
