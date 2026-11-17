/**
 * Security tests: tokens, sessions (rotation, reuse detection, revocation), brute-force lockout, password reset
 * by one-time code, object-level authorisation across users, upload restrictions, headers and rate limiting.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { signAccessToken, verifyAccessToken } from "../src/auth/tokens";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let alice = "", bob = "", carol = "";
let aTok = "", bTok = "", cTok = "";
let chatAB = "";

before(async () => {
  t = await bootApp("security", { AUTH_RATE_LIMIT_PER_MIN: "15" });
  alice = t.createUser("Alice", "9400000001", "alice-pass-1");
  bob = t.createUser("Bob", "9400000002", "bob-pass-12");
  carol = t.createUser("Carol", "9400000003", "carol-pass-1");
  aTok = t.tokenFor(alice);
  bTok = t.tokenFor(bob);
  cTok = t.tokenFor(carol);
  chatAB = t.store.createOneToOneChat(alice, bob).id;
});
after(() => t.close());

/** Extracts the refresh cookie from a Set-Cookie header. */
const cookieOf = (h: Headers) => (h.get("set-cookie") ?? "").split(";")[0];

/* ---------------- tokens ---------------- */

test("access tokens: valid, tampered, wrong key, expired, and alg=none are handled correctly", () => {
  const key = Buffer.from("k".repeat(40));
  const tok = signAccessToken(key, "u1", "s1");
  assert.equal(verifyAccessToken(key, tok).ok, true);
  const [h, p, s] = tok.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "admin" })).toString("base64url");
  assert.deepEqual(verifyAccessToken(key, `${h}.${forgedPayload}.${s}`), { ok: false, reason: "BAD_SIGNATURE" });
  assert.equal(verifyAccessToken(Buffer.from("x".repeat(40)), tok).ok, false);
  assert.deepEqual(verifyAccessToken(key, signAccessToken(key, "u1", "s1", 1000)), { ok: false, reason: "EXPIRED" });
  const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
  assert.deepEqual(verifyAccessToken(key, none), { ok: false, reason: "MALFORMED" });
});

/* ---------------- authentication flows ---------------- */

test("protected routes reject missing and garbage tokens; public routes stay open", async () => {
  assert.equal((await call(t.base, "GET", "/chats/summaries?userId=" + alice)).status, 401);
  assert.equal((await call(t.base, "GET", "/chats/summaries?userId=" + alice, { token: "abc.def.ghi" })).status, 401);
  assert.equal((await call(t.base, "GET", "/health")).status, 200);
  assert.equal((await call(t.base, "POST", "/auth/dev-login", { body: { phone: "9400000001", name: "x" } })).status, 404, "passwordless dev login is gone");
  assert.equal((await call(t.base, "POST", "/auth/reset-password", { body: { phone: "9400000001", name: "Alice", newPassword: "x" } })).status, 404, "name-based reset is gone");
});

test("sign-in sets an httpOnly refresh cookie; refresh rotates it; replaying an old one revokes the session", async () => {
  const signIn = await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000002", password: "bob-pass-12" } });
  assert.equal(signIn.status, 200);
  assert.ok(signIn.body.accessToken);
  assert.equal(signIn.body.refreshToken, undefined, "browsers never see the refresh token");
  const setCookie = signIn.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const c1 = cookieOf(signIn.headers);

  const r1 = await call(t.base, "POST", "/auth/refresh", { headers: { Cookie: c1 } });
  assert.equal(r1.status, 200);
  const c2 = cookieOf(r1.headers);
  assert.notEqual(c1, c2, "refresh token rotates");
  assert.equal((await call(t.base, "GET", `/users/${bob}/preferences`, { token: r1.body.accessToken })).status, 200);

  // Attacker replays the first (already rotated) token: the whole session family is revoked.
  assert.equal((await call(t.base, "POST", "/auth/refresh", { headers: { Cookie: c1 } })).status, 401);
  assert.equal((await call(t.base, "POST", "/auth/refresh", { headers: { Cookie: c2 } })).status, 401, "legit token is revoked too");
  assert.equal((await call(t.base, "GET", `/users/${bob}/preferences`, { token: r1.body.accessToken })).status, 401, "access tokens of the revoked session stop working immediately");
});

test("native clients get the refresh token in the body instead of a cookie", async () => {
  const r = await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000003", password: "carol-pass-1", client: "native" } });
  assert.ok(r.body.refreshToken);
  assert.equal(r.headers.get("set-cookie"), null);
  const refreshed = await call(t.base, "POST", "/auth/refresh", { body: { client: "native", refreshToken: r.body.refreshToken } });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.refreshToken, r.body.refreshToken);
});

test("device list, remote sign-out and logout", async () => {
  const s1 = await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000001", password: "alice-pass-1" } });
  const s2 = await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000001", password: "alice-pass-1" }, headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/120" } });
  const list = await call(t.base, "GET", "/auth/sessions", { token: s1.body.accessToken });
  assert.ok(list.body.length >= 2);
  assert.equal(list.body.filter((x: { current: boolean }) => x.current).length, 1);
  assert.ok(list.body.some((x: { device: string }) => x.device === "Chrome on Android"));
  // Sign the phone out remotely from the first device.
  assert.equal((await call(t.base, "DELETE", `/auth/sessions/${s2.body.sessionId}`, { token: s1.body.accessToken })).status, 200);
  assert.equal((await call(t.base, "GET", "/auth/sessions", { token: s2.body.accessToken })).status, 401);
  // Bob cannot revoke Alice's sessions.
  assert.equal((await call(t.base, "DELETE", `/auth/sessions/${s1.body.sessionId}`, { token: bTok })).status, 404);
  // Logout revokes the cookie's session.
  const out = await call(t.base, "POST", "/auth/logout", { headers: { Cookie: cookieOf(s1.headers) } });
  assert.equal(out.status, 200);
  assert.equal((await call(t.base, "GET", "/auth/sessions", { token: s1.body.accessToken })).status, 401);
});

test("five wrong passwords lock the account for 15 minutes (even with the right password)", async () => {
  t.createUser("Dave", "9400000009", "dave-pass-12");
  for (let i = 0; i < 5; i++) assert.equal((await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000009", password: "wrong-pass" } })).status, 401);
  const locked = await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000009", password: "dave-pass-12" } });
  assert.equal(locked.status, 401);
  assert.match(JSON.stringify(locked.body), /TOO_MANY_ATTEMPTS/);
});

test("password reset needs the one-time code, limits guesses, and signs out every device", async () => {
  const eveId = t.createUser("Eve", "9400000010", "eve-pass-123");
  t.store.users.find((u) => u.id === eveId)!.email = "eve@example.com"; // reset codes go by email
  const eveTok = t.tokenFor(eveId);
  assert.equal((await call(t.base, "POST", "/auth/password-reset/request", { body: { phone: "9400000010" } })).status, 200);
  assert.equal((await call(t.base, "POST", "/auth/password-reset/request", { body: { phone: "9999999999" } })).status, 200, "unknown numbers get the same answer");
  const code = t.lastCode("eve@example.com")!;
  assert.equal((await call(t.base, "POST", "/auth/password-reset/confirm", { body: { phone: "9400000010", code: "000000" === code ? "111111" : "000000", newPassword: "new-pass-123" } })).status, 400);
  assert.equal((await call(t.base, "POST", "/auth/password-reset/confirm", { body: { phone: "9400000010", code, newPassword: "short" } })).status, 400);
  assert.equal((await call(t.base, "POST", "/auth/password-reset/confirm", { body: { phone: "9400000010", code, newPassword: "new-pass-123" } })).status, 200);
  assert.equal((await call(t.base, "GET", `/users/${eveId}/preferences`, { token: eveTok })).status, 401, "old sessions revoked");
  assert.equal((await call(t.base, "POST", "/auth/sign-in", { body: { phone: "9400000010", password: "new-pass-123" } })).status, 200);
  assert.equal((await call(t.base, "POST", "/auth/password-reset/confirm", { body: { phone: "9400000010", code, newPassword: "again-pass-1" } })).status, 400, "codes are single-use");
});

/* ---------------- object-level authorisation (IDOR) ---------------- */

test("users cannot read or act on other people's chats, messages or data", async () => {
  // Carol is not in Alice+Bob's chat.
  assert.equal((await call(t.base, "GET", `/messages/${chatAB}`, { token: cTok })).status, 403);
  assert.equal((await call(t.base, "POST", "/messages", { token: cTok, body: { chatId: chatAB, senderId: carol, encryptedContent: "eA==" } })).status, 403);
  assert.equal((await call(t.base, "POST", "/messages", { token: aTok, body: { chatId: chatAB, senderId: bob, encryptedContent: "eA==" } })).status, 403, "no sending as Bob");
  assert.equal((await call(t.base, "GET", `/chats/summaries?userId=${alice}`, { token: cTok })).status, 403);
  assert.equal((await call(t.base, "PATCH", `/users/${alice}`, { token: cTok, body: { name: "Hacked" } })).status, 403);
  assert.equal((await call(t.base, "DELETE", `/users/${alice}`, { token: cTok })).status, 403);
  assert.equal((await call(t.base, "POST", "/chats", { token: cTok, body: { type: "ONE_TO_ONE", memberIds: [alice, bob] } })).status, 403, "cannot create chats for others");
  const mine = await call(t.base, "GET", "/chats", { token: cTok });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 0, "listing chats returns only your own");
  // Members can.
  assert.equal((await call(t.base, "POST", "/messages", { token: aTok, body: { chatId: chatAB, senderId: alice, encryptedContent: "eA==" } })).status, 201);
  assert.equal((await call(t.base, "GET", `/messages/${chatAB}`, { token: bTok })).status, 200);
});

/* ---------------- uploads ---------------- */

const uploadFile = (token: string | null, name: string, type: string, bytes = new Uint8Array([137, 80, 78, 71])) => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return fetch(`${t.base}/uploads`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
};

test("uploads: login required, dangerous types refused, files private to owner and chat members", async () => {
  assert.equal((await uploadFile(null, "a.png", "image/png")).status, 401);
  assert.equal((await uploadFile(aTok, "evil.html", "text/html", new TextEncoder().encode("<script>alert(1)</script>"))).status, 400);
  assert.equal((await uploadFile(aTok, "evil.svg", "image/svg+xml")).status, 400);
  assert.equal((await uploadFile(aTok, "fake.png", "text/html")).status, 400, "mime/extension mismatch");

  const up = await (await uploadFile(aTok, "photo.png", "image/png")).json();
  const path = up.url.replace("/api", "");
  assert.match(path, /^\/uploads\/[0-9a-f]{32}\.png$/, "random server-side file name");
  assert.equal((await fetch(t.base + path)).status, 401);
  assert.equal((await fetch(`${t.base}${path}?access_token=${cTok}`)).status, 403, "stranger");
  const own = await fetch(`${t.base}${path}?access_token=${aTok}`);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("x-content-type-options"), "nosniff");
  assert.match(own.headers.get("content-security-policy") ?? "", /sandbox/);
  assert.equal((await fetch(`${t.base}${path}?access_token=${bTok}`)).status, 403, "not shared yet");
  await call(t.base, "POST", "/messages", { token: aTok, body: { chatId: chatAB, senderId: alice, encryptedContent: "eA==", messageType: "IMAGE", attachmentUrl: up.url, fileName: "photo.png", mimeType: "image/png", fileSize: 4 } });
  assert.equal((await fetch(`${t.base}${path}?access_token=${bTok}`)).status, 200, "chat member after sharing");
  assert.equal((await fetch(`${t.base}${path}?access_token=${cTok}`)).status, 403, "still not a stranger's");

  const pdf = await (await uploadFile(aTok, "doc.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4"))).json();
  const pdfRes = await fetch(`${t.base}${pdf.url.replace("/api", "")}?access_token=${aTok}`);
  assert.match(pdfRes.headers.get("content-disposition") ?? "", /^attachment/, "non-media files are downloaded, never rendered");
});

/* ---------------- headers & rate limiting ---------------- */

test("security headers are set and CORS only allows known origins", async () => {
  const r = await fetch(`${t.base}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  const ok = await fetch(`${t.base}/health`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("authentication endpoints are rate limited (429 with Retry-After)", async () => {
  let last = 0;
  let retry: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${t.base}/auth/password-reset/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9400000077" }) });
    last = r.status;
    retry = r.headers.get("retry-after");
    if (last === 429) break;
  }
  assert.equal(last, 429);
  assert.ok(Number(retry) > 0);
});

test("only the sender can edit a message, within 15 minutes; nobody approves their own erase request", async () => {
  const sent = await call(t.base, "POST", "/messages", { token: aTok, body: { chatId: chatAB, senderId: alice, encryptedContent: "b3JpZ2luYWw=" } });
  const id = sent.body.id;
  assert.equal((await call(t.base, "PATCH", `/messages/${id}`, { token: bTok, body: { encryptedContent: "aGFja2Vk" } })).status, 403, "Bob cannot rewrite Alice's message");
  assert.equal((await call(t.base, "PATCH", `/messages/${id}`, { token: aTok, body: { encryptedContent: "ZWRpdGVk" } })).status, 200);
  t.store.messages.find((m) => m.id === id)!.createdAt = new Date(Date.now() - 16 * 60_000).toISOString();
  assert.equal((await call(t.base, "PATCH", `/messages/${id}`, { token: aTok, body: { encryptedContent: "bGF0ZQ==" } })).status, 403, "edit window closed");

  const req = await call(t.base, "POST", "/messages/delete-requests", { token: aTok, body: { chatId: chatAB, requestedBy: alice } });
  assert.ok([400, 403].includes((await call(t.base, "POST", `/messages/delete-requests/${req.body.id}/approve`, { token: aTok, body: { userId: alice } })).status), "requester cannot approve");
  assert.equal((await call(t.base, "POST", `/messages/delete-requests/${req.body.id}/approve`, { token: cTok, body: { userId: carol } })).status, 403, "outsider");
});

test("blocking stops messages (both ways) and only the owner manages their block list", async () => {
  const dan = t.createUser("Dan", "9400000020", "dan-pass-123");
  const dTok = t.tokenFor(dan);
  const chatAD = t.store.createOneToOneChat(alice, dan).id;
  const say = (token: string, senderId: string) => call(t.base, "POST", "/messages", { token, body: { chatId: chatAD, senderId, encryptedContent: "aGk=" } });
  assert.equal((await say(dTok, dan)).status, 201);
  assert.equal((await call(t.base, "POST", `/users/${alice}/blocks`, { token: dTok, body: { targetId: dan } })).status, 403, "Dan cannot edit Alice's block list");
  assert.equal((await call(t.base, "POST", `/users/${alice}/blocks`, { token: aTok, body: { targetId: dan } })).status, 200);
  assert.equal((await say(dTok, dan)).status, 403, "blocked user cannot message");
  assert.equal((await say(aTok, alice)).status, 403, "the blocker cannot message either while blocking");
  const list = await call(t.base, "GET", `/users/${alice}/blocks`, { token: aTok });
  assert.deepEqual(list.body.map((u: { id: string }) => u.id), [dan]);
  assert.equal((await call(t.base, "DELETE", `/users/${alice}/blocks/${dan}`, { token: aTok })).status, 200);
  assert.equal((await say(dTok, dan)).status, 201, "unblocked again");
});
