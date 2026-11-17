/** E2EE public-key directory: validation, ownership, immutability, chat-scoped lookup. */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let alice = "", bob = "", carol = "", chat = "";
let aTok = "", bTok = "", cTok = "";

async function pubKey(alg: "ECDH" | "ECDSA") {
  const kp = (await webcrypto.subtle.generateKey({ name: alg, namedCurve: "P-256" }, true, alg === "ECDH" ? ["deriveBits"] : ["sign", "verify"])) as CryptoKeyPair;
  return Buffer.from(await webcrypto.subtle.exportKey("raw", kp.publicKey)).toString("base64");
}

before(async () => {
  t = await bootApp("keys");
  alice = t.createUser("Alice", "9500000001");
  bob = t.createUser("Bob", "9500000002");
  carol = t.createUser("Carol", "9500000003");
  [aTok, bTok, cTok] = [alice, bob, carol].map((u) => t.tokenFor(u));
  chat = t.store.createOneToOneChat(alice, bob).id;
});
after(() => t.close());

test("devices register real P-256 public keys; junk is rejected", async () => {
  const good = { deviceId: "alice-laptop-0001", agreementKey: await pubKey("ECDH"), signingKey: await pubKey("ECDSA"), label: "Chrome on Windows" };
  assert.equal((await call(t.base, "POST", "/keys/devices", { body: good })).status, 401);
  assert.equal((await call(t.base, "POST", "/keys/devices", { token: aTok, body: good })).status, 200);
  assert.equal((await call(t.base, "POST", "/keys/devices", { token: aTok, body: good })).status, 200, "re-registering the same keys is idempotent");
  assert.equal((await call(t.base, "POST", "/keys/devices", { token: aTok, body: { ...good, agreementKey: "AAAA" } })).status, 400);
  assert.equal((await call(t.base, "POST", "/keys/devices", { token: aTok, body: { ...good, signingKey: await pubKey("ECDSA") } })).status, 409, "keys of a device id never change");
  assert.equal((await call(t.base, "POST", "/keys/devices", { token: bTok, body: good })).status, 409, "cannot hijack someone's device id");
  await call(t.base, "POST", "/keys/devices", { token: bTok, body: { deviceId: "bob-phone-00001", agreementKey: await pubKey("ECDH"), signingKey: await pubKey("ECDSA") } });
});

test("chat key lookup is limited to members and returns every member device", async () => {
  const keys = await call(t.base, "GET", `/keys/chats/${chat}`, { token: bTok });
  assert.equal(keys.status, 200);
  assert.deepEqual(keys.body.map((k: { deviceId: string }) => k.deviceId).sort(), ["alice-laptop-0001", "bob-phone-00001"]);
  assert.equal((await call(t.base, "GET", `/keys/chats/${chat}`, { token: cTok })).status, 403);
});

test("revoked devices stay listed (for verifying old messages) but marked revoked", async () => {
  assert.equal((await call(t.base, "DELETE", "/keys/devices/alice-laptop-0001", { token: bTok })).status, 404, "only the owner revokes");
  assert.equal((await call(t.base, "DELETE", "/keys/devices/alice-laptop-0001", { token: aTok })).status, 200);
  const keys = await call(t.base, "GET", `/users/${alice}`.replace("/users", "/keys/users"), { token: bTok });
  assert.equal(keys.body[0].revoked, true);
});

test("oversized message payloads are refused", async () => {
  const big = "x".repeat(70000);
  const r = await call(t.base, "POST", "/messages", { token: aTok, body: { chatId: chat, senderId: alice, encryptedContent: big } });
  assert.ok(r.status === 400 || r.status === 413, `got ${r.status}`);
});

test("devices inactive for 30 days stop receiving message keys", async () => {
  await call(t.base, "POST", "/keys/devices", { token: bTok, body: { deviceId: "bob-old-tablet-1", agreementKey: await pubKey("ECDH"), signingKey: await pubKey("ECDSA") } });
  t.store.deviceKeys.find((d) => d.deviceId === "bob-old-tablet-1")!.lastSeenAt = new Date(Date.now() - 31 * 24 * 3600_000).toISOString();
  const keys = await call(t.base, "GET", `/keys/chats/${chat}`, { token: aTok });
  assert.equal(keys.body.find((k: { deviceId: string }) => k.deviceId === "bob-old-tablet-1").revoked, true);
  assert.equal(keys.body.find((k: { deviceId: string }) => k.deviceId === "bob-phone-00001").revoked, false);
});
