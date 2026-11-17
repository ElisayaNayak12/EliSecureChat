/** End-to-end encryption envelope tests (real WebCrypto in Node). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptEnvelope, encryptEnvelope, exportPublic, generateDeviceKeys, parse, safetyCode, serialize, type DeviceKeys, type PublicDevice } from "../src/e2ee/envelope";

async function device(userId: string, id: string): Promise<{ keys: DeviceKeys; pub: PublicDevice }> {
  const keys = await generateDeviceKeys(id);
  return { keys, pub: { deviceId: id, userId, ...(await exportPublic(keys)) } };
}

const setup = async () => {
  const alicePhone = await device("alice", "a-phone");
  const aliceLaptop = await device("alice", "a-laptop");
  const bob = await device("bob", "b-phone");
  const eve = await device("eve", "e-phone");
  return { alicePhone, aliceLaptop, bob, eve };
};

test("every recipient device (and the sender's other devices) can decrypt; signature verifies", async () => {
  const { alicePhone, aliceLaptop, bob } = await setup();
  const env = await encryptEnvelope({ plaintext: "Hello Bob 👋", chatId: "c1", senderId: "alice", sender: alicePhone.keys, recipients: [alicePhone.pub, aliceLaptop.pub, bob.pub] });
  for (const me of [bob.keys, aliceLaptop.keys, alicePhone.keys]) {
    const r = await decryptEnvelope({ envelope: env, chatId: "c1", senderId: "alice", me, senderSigningKey: alicePhone.pub.signingKey });
    assert.deepEqual(r, { ok: true, text: "Hello Bob 👋", verified: true });
  }
});

test("the server sees no plaintext, and identical messages encrypt differently", async () => {
  const { alicePhone, bob } = await setup();
  const a = serialize(await encryptEnvelope({ plaintext: "secret meeting at 5", chatId: "c1", senderId: "alice", sender: alicePhone.keys, recipients: [bob.pub] }));
  const b = serialize(await encryptEnvelope({ plaintext: "secret meeting at 5", chatId: "c1", senderId: "alice", sender: alicePhone.keys, recipients: [bob.pub] }));
  assert.ok(!a.includes("secret") && !a.includes(btoa("secret meeting at 5")));
  assert.notEqual(a, b);
  assert.ok(parse(a));
});

test("a device that was not a recipient cannot decrypt", async () => {
  const { alicePhone, bob, eve } = await setup();
  const env = await encryptEnvelope({ plaintext: "hi", chatId: "c1", senderId: "alice", sender: alicePhone.keys, recipients: [bob.pub] });
  const r = await decryptEnvelope({ envelope: env, chatId: "c1", senderId: "alice", me: eve.keys, senderSigningKey: alicePhone.pub.signingKey });
  assert.deepEqual(r, { ok: false, reason: "NOT_FOR_THIS_DEVICE" });
  // Even if Eve (or the server) copies Bob's key slot under her own device id, the key is sealed to Bob's key.
  const stolen = { ...env, keys: { "e-phone": env.keys["b-phone"] } };
  const r2 = await decryptEnvelope({ envelope: stolen, chatId: "c1", senderId: "alice", me: eve.keys, senderSigningKey: null });
  assert.deepEqual(r2, { ok: false, reason: "DECRYPT_FAILED" });
});

test("tampering with the ciphertext, chat, or sender is detected", async () => {
  const { alicePhone, bob, eve } = await setup();
  const env = await encryptEnvelope({ plaintext: "pay 100", chatId: "c1", senderId: "alice", sender: alicePhone.keys, recipients: [bob.pub] });
  const flipped = { ...env, ct: env.ct.slice(0, -4) + (env.ct.endsWith("AAAA") ? "BBBB" : "AAAA") };
  assert.equal((await decryptEnvelope({ envelope: flipped, chatId: "c1", senderId: "alice", me: bob.keys, senderSigningKey: alicePhone.pub.signingKey })).ok, false);
  assert.equal((await decryptEnvelope({ envelope: flipped, chatId: "c1", senderId: "alice", me: bob.keys, senderSigningKey: null })).ok, false, "AES-GCM catches it even without the signature");
  assert.equal((await decryptEnvelope({ envelope: env, chatId: "other-chat", senderId: "alice", me: bob.keys, senderSigningKey: null })).ok, false, "replay into another chat fails");
  // A forged sender: Eve's signature does not verify against Alice's key.
  const forged = await encryptEnvelope({ plaintext: "pay 1000", chatId: "c1", senderId: "alice", sender: eve.keys, recipients: [bob.pub] });
  assert.deepEqual(await decryptEnvelope({ envelope: forged, chatId: "c1", senderId: "alice", me: bob.keys, senderSigningKey: alicePhone.pub.signingKey }), { ok: false, reason: "BAD_SIGNATURE" });
});

test("private keys cannot be exported", async () => {
  const { alicePhone } = await setup();
  await assert.rejects(() => globalThis.crypto.subtle.exportKey("pkcs8", alicePhone.keys.agreement.privateKey));
  await assert.rejects(() => globalThis.crypto.subtle.exportKey("pkcs8", alicePhone.keys.signing.privateKey));
});

test("safety codes match on both sides and change when a key changes", async () => {
  const a = { userId: "alice", signingKeys: ["k1", "k2"] };
  const b = { userId: "bob", signingKeys: ["k3"] };
  const ab = await safetyCode(a, b);
  assert.equal(ab, await safetyCode(b, { userId: "alice", signingKeys: ["k2", "k1"] }));
  assert.match(ab, /^(\d{5} ){11}\d{5}$/);
  assert.notEqual(ab, await safetyCode(a, { userId: "bob", signingKeys: ["k4"] }));
});
