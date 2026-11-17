/**
 * Where the app talks to the server, for every platform built from this one codebase.
 *
 * - Web, same domain as the server (recommended hosting): nothing to set. Requests go to "/api" on the same
 *   origin (the Vite dev proxy locally, the backend itself in production).
 * - Web app hosted on a different domain from the server: build with VITE_SERVER_URL=https://your-server.example.com
 *   (the Flutter Android app has its own server setting).
 */

const SERVER_URL = String(import.meta.env.VITE_SERVER_URL ?? "").replace(/\/+$/, "");

/**
 * Token mode: the refresh token travels in request bodies (as the Flutter app does) instead of the httpOnly cookie.
 * Only for testing the native flow in a browser (VITE_AUTH_MODE=native); normal web builds use the cookie.
 */
export const USE_NATIVE_AUTH = import.meta.env.VITE_AUTH_MODE === "native";

/** Origin of the server, e.g. "https://chat.example.com" ("" means the page's own origin). */
export const SERVER_ORIGIN = SERVER_URL || (typeof window !== "undefined" ? window.location.origin : "");

/** Base for REST calls. */
export const API_URL = SERVER_URL ? `${SERVER_URL}/api` : String(import.meta.env.VITE_API_URL ?? "/api");

/** Base for the realtime socket. */
export const SOCKET_URL = SERVER_URL || String(import.meta.env.VITE_SOCKET_URL ?? "") || SERVER_ORIGIN;

/** Turns a server-relative path such as "/api/uploads/x.png" into a full URL the app can load. */
export function absoluteUrl(path: string) {
  if (!path || /^(https?:|blob:|data:)/i.test(path)) return path;
  return path.startsWith("/") ? `${SERVER_ORIGIN}${path}` : path;
}
