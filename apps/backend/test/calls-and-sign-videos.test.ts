/**
 * Integration: authenticated Socket.IO (calls, translation relay, impersonation attempts),
 * the human sign-video library and call history.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { lookupSignVideo, normalizePhrase } from "../src/sign-videos/sign-video-rules";
import { parseSignal, parseTranslation } from "../src/websocket/call-payloads";
import type { SignVideo } from "../src/store/models";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let alice = "", bob = "", carol = "", chatId = "", adminToken = "";
const tokens: Record<string, string> = {};
const sockets: Socket[] = [];

before(async () => {
  t = await bootApp("calls", { CALL_RING_TIMEOUT_MS: "600" });
  alice = t.createUser("Alice", "9200000001");
  bob = t.createUser("Bob", "9200000002");
  carol = t.createUser("Carol", "9200000003");
  for (const id of [alice, bob, carol]) tokens[id] = t.tokenFor(id);
  chatId = t.store.createOneToOneChat(alice, bob).id;
  adminToken = t.store.createAdminSession();
});

after(async () => {
  for (const s of sockets) s.disconnect();
  await t.close();
});

async function connectAs(userId: string): Promise<Socket> {
  const s = io(`${t.base}/chat`, { transports: ["websocket"], forceNew: true, auth: { token: tokens[userId] } });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connected", () => resolve());
    s.once("auth_error", (e) => reject(new Error(e.error)));
    s.once("connect_error", reject);
  });
  return s;
}

function next<T = any>(s: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    s.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/* ---------------- pure payload rules ---------------- */

test("parseSignal accepts offers/answers/ICE and rejects junk", () => {
  assert.deepEqual(parseSignal({ type: "offer", sdp: "v=0" }), { type: "offer", sdp: "v=0" });
  assert.equal(parseSignal({ type: "ice", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } })?.type, "ice");
  assert.equal(parseSignal({ type: "offer", sdp: "" }), null);
  assert.equal(parseSignal({ type: "hack" }), null);
  assert.equal(parseSignal("x"), null);
});

test("parseTranslation enforces source, length, confidence range and engine", () => {
  const ok = parseTranslation({ source: "sign", text: " Hello ", final: true, confidence: 0.91234, language: "en-IN", engine: "personal-dtw", gloss: ["HELLO"] });
  assert.equal(ok?.text, "Hello");
  assert.equal(ok?.confidence, 0.912);
  assert.equal(parseTranslation({ source: "sign", text: "x", final: true, confidence: 1.5, language: "en", engine: "e" }), null);
  assert.equal(parseTranslation({ source: "magic", text: "x", final: true, confidence: null, language: "en", engine: "e" }), null);
  assert.equal(parseTranslation({ source: "typed", text: "x".repeat(501), final: true, confidence: null, language: "en", engine: "e" }), null);
});

/* ---------------- socket authentication ---------------- */

test("sockets without a valid token are disconnected", async () => {
  for (const auth of [{}, { token: "forged.token.value" }]) {
    const s = io(`${t.base}/chat`, { transports: ["websocket"], forceNew: true, auth });
    sockets.push(s);
    const err = await next<{ error: string }>(s, "auth_error");
    assert.equal(err.error, "INVALID_OR_EXPIRED_TOKEN");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(s.connected, false);
  }
});

test("a connected user cannot act as someone else or touch other people's chats", async () => {
  const c = await connectAs(carol);
  const asBob = await c.emitWithAck("send_message", { chatId, senderId: bob, encryptedContent: "x" });
  assert.equal(asBob.ok, false);
  const intoTheirChat = await c.emitWithAck("join_chat", { chatId });
  assert.equal(intoTheirChat.error, "NOT_A_CHAT_MEMBER");
  const presenceSpoof = await c.emitWithAck("register_presence", { userId: alice });
  assert.equal(presenceSpoof.error, "NOT_YOUR_ACCOUNT");
  c.disconnect();
});

test("revoking a session stops that access token from connecting", async () => {
  const issued = t.auth.issue(t.store.users.find((u) => u.id === carol)!, "test");
  t.auth.revoke(issued.sessionId, "TEST");
  const s = io(`${t.base}/chat`, { transports: ["websocket"], forceNew: true, auth: { token: issued.accessToken } });
  sockets.push(s);
  assert.equal((await next<{ error: string }>(s, "auth_error")).error, "INVALID_OR_EXPIRED_TOKEN");
});

/* ---------------- signalling ---------------- */

test("full call: invite -> accept -> SDP/ICE relay -> translation relay -> hangup, recorded in history", async () => {
  const a = await connectAs(alice);
  const b = await connectAs(bob);

  const incoming = next(b, "call:incoming");
  const inv = await a.emitWithAck("call:invite", { chatId, media: "VIDEO" });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  const ring = await incoming;
  assert.equal(ring.from.id, alice);

  assert.equal((await a.emitWithAck("call:signal", { callId: inv.callId, data: { type: "offer", sdp: "v=0" } })).error, "CALL_NOT_ACTIVE");
  const accepted = next(a, "call:accepted");
  assert.equal((await b.emitWithAck("call:accept", { callId: inv.callId })).ok, true);
  await accepted;

  const offer = next(b, "call:signal");
  assert.equal((await a.emitWithAck("call:signal", { callId: inv.callId, data: { type: "offer", sdp: "v=0 offer" } })).ok, true);
  assert.deepEqual((await offer).data, { type: "offer", sdp: "v=0 offer" });

  const ice = next(a, "call:signal");
  await b.emitWithAck("call:signal", { callId: inv.callId, data: { type: "ice", candidate: { candidate: "candidate:9", sdpMid: "0", sdpMLineIndex: 0 } } });
  assert.equal((await ice).data.candidate.candidate, "candidate:9");

  const tr = next(a, "call:translation");
  await b.emitWithAck("call:translation", {
    callId: inv.callId,
    payload: { source: "sign", text: "Thank you", final: true, confidence: 0.82, language: "en-IN", engine: "personal-dtw", gloss: ["THANK-YOU"] },
  });
  const got = await tr;
  assert.equal(got.payload.text, "Thank you");
  assert.equal(got.from, bob);

  // Each side shares its sign language so the other can show matching signs / previews.
  const prof = next(a, "call:profile");
  assert.equal((await b.emitWithAck("call:profile", { callId: inv.callId, profile: { signLanguage: "isl" } })).ok, true);
  assert.deepEqual((await prof).profile, { signLanguage: "isl" });
  assert.equal((await b.emitWithAck("call:profile", { callId: inv.callId, profile: { signLanguage: "klingon" } })).error, "INVALID_PROFILE");
  assert.equal((await b.emitWithAck("call:profile", { callId: "not-a-call", profile: { signLanguage: null } })).error, "CALL_NOT_ACTIVE");

  const ended = next(b, "call:ended");
  assert.equal((await a.emitWithAck("call:end", { callId: inv.callId })).ok, true);
  assert.equal((await ended).status, "ENDED");

  const history = await call(t.base, "GET", `/calls?userId=${bob}`, { token: tokens[bob] });
  assert.equal(history.body[0].status, "ENDED");
  assert.equal(history.body[0].aiAssistUsed, true);
  assert.equal((await call(t.base, "GET", `/calls?userId=${bob}`, { token: tokens[alice] })).status, 403, "no reading other people's call history");
});

test("a user outside the chat cannot invite, accept or inject signals", async () => {
  const a = await connectAs(alice);
  const b = await connectAs(bob);
  const c = await connectAs(carol);
  assert.equal((await c.emitWithAck("call:invite", { chatId, media: "VIDEO" })).error, "CHAT_NOT_FOUND");
  const incoming = next(b, "call:incoming");
  const inv = await a.emitWithAck("call:invite", { chatId, media: "AUDIO" });
  await incoming;
  assert.equal((await c.emitWithAck("call:accept", { callId: inv.callId })).error, "CALL_NOT_FOUND");
  assert.equal((await c.emitWithAck("call:signal", { callId: inv.callId, data: { type: "offer", sdp: "x" } })).error, "CALL_NOT_FOUND");
  assert.equal((await a.emitWithAck("call:accept", { callId: inv.callId })).error, "INVALID_STATE");
  const ended = next(a, "call:ended");
  await b.emitWithAck("call:decline", { callId: inv.callId });
  assert.equal((await ended).status, "DECLINED");
});

test("unanswered calls become MISSED after the ring timeout", async () => {
  const a = await connectAs(alice);
  const b = await connectAs(bob);
  const incoming = next(b, "call:incoming");
  const inv = await a.emitWithAck("call:invite", { chatId, media: "VIDEO" });
  await incoming;
  const ended = await next(a, "call:ended", 3000);
  assert.equal(ended.status, "MISSED");
  assert.equal(ended.callId, inv.callId);
});

test("calling an offline user fails immediately with PEER_OFFLINE", async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await new Promise((r) => setTimeout(r, 100));
  const a = await connectAs(alice);
  assert.equal((await a.emitWithAck("call:invite", { chatId, media: "VIDEO" })).error, "PEER_OFFLINE");
});

/* ---------------- sign-video library ---------------- */

function videoForm(fields: Record<string, string>, type = "video/webm") {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type }), "clip.webm");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

const validFields = () => ({
  signLanguageId: "isl", unit: "SENTENCE", phraseText: "How are you?", gloss: "YOU HOW", meaning: "A greeting asking about wellbeing",
  signerId: "signer-001", quality: "HIGH", license: "Owner-recorded, all rights reserved", provenance: "Recorded for SignConnect test, 2026-11-10",
  consentConfirmed: "true", uploadedBy: alice,
});

const upload = (form: FormData, token: string) => fetch(`${t.base}/sign-videos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });

test("uploads are validated and every issue is reported", async () => {
  const res = await upload(videoForm({ ...validFields(), signLanguageId: "xx", consentConfirmed: "false", license: "" }, "image/png"), tokens[alice]);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.issues.length >= 4, JSON.stringify(body.issues));
});

test("an uploaded video is not served or matched until an admin verifies it", async () => {
  assert.equal((await upload(videoForm(validFields()), tokens[bob])).status, 403, "cannot upload as someone else");
  const up = await upload(videoForm(validFields()), tokens[alice]);
  assert.equal(up.status, 201);
  const video = await up.json();
  assert.equal(video.verificationStatus, "UNVERIFIED");
  assert.equal(video.fileName, undefined, "on-disk name must not leak");

  const lookup = (text: string, lang = "isl") => call(t.base, "GET", `/sign-videos/lookup?language=${lang}&text=${encodeURIComponent(text)}`, { token: tokens[bob] });
  assert.equal((await lookup("how are you")).body.reason, "LANGUAGE_HAS_NO_VERIFIED_VIDEOS");
  assert.equal((await fetch(`${t.base}/sign-videos/${video.id}/file`)).status, 401);
  assert.equal((await fetch(`${t.base}/sign-videos/${video.id}/file?access_token=${tokens[bob]}`)).status, 403, "others can't see unverified");
  assert.equal((await fetch(`${t.base}/sign-videos/${video.id}/file?access_token=${tokens[alice]}`)).status, 200, "uploader can preview");

  assert.equal((await call(t.base, "PATCH", `/admin/sign-videos/${video.id}`, { body: { status: "VERIFIED" } })).status, 401);
  const verified = await call(t.base, "PATCH", `/admin/sign-videos/${video.id}`, { body: { status: "VERIFIED" }, headers: { "x-admin-token": adminToken } });
  assert.equal(verified.body.verificationStatus, "VERIFIED");

  const hit = await lookup("How are you?");
  assert.equal(hit.body.reason, "EXACT_VERIFIED_MATCH");
  assert.equal((await fetch(`${t.base}/sign-videos/${video.id}/file?access_token=${tokens[bob]}`)).status, 200);
  assert.equal((await lookup("how are you today")).body.match, null);
  assert.equal((await lookup("how are you", "asl")).body.match, null);
});

test("lookup never stitches individual sign clips into a sentence", () => {
  const clip = (phrase: string, unit: SignVideo["unit"]): SignVideo => ({
    id: phrase, signLanguageId: "isl", unit, phraseText: phrase, normalizedPhrase: normalizePhrase(phrase), gloss: phrase.toUpperCase(),
    meaning: phrase, signerId: "s", quality: "MEDIUM", license: "l", provenance: "p", consentConfirmed: true,
    verificationStatus: "VERIFIED", fileName: "f", mimeType: "video/webm", sizeBytes: 1, sha256: "x", uploadedBy: "u", createdAt: "",
  });
  const lib = [clip("thank", "SIGN"), clip("you", "SIGN")];
  assert.equal(lookupSignVideo(lib, "isl", "thank you").match, null);
  assert.equal(lookupSignVideo(lib, "isl", "Thank!").match?.id, "thank");
  assert.equal(normalizePhrase("  Don't   STOP!! "), "dont stop");
});

test("blocked users cannot message or call over the socket", async () => {
  t.store.users.find((u) => u.id === bob)!.blockedUserIds = [alice];
  try {
    const a = await connectAs(alice);
    await connectAs(bob);
    assert.equal((await a.emitWithAck("send_message", { chatId, senderId: alice, encryptedContent: "aGk=" })).error, "BLOCKED");
    assert.equal((await a.emitWithAck("call:invite", { chatId, media: "VIDEO" })).error, "BLOCKED");
  } finally {
    t.store.users.find((u) => u.id === bob)!.blockedUserIds = [];
  }
});
