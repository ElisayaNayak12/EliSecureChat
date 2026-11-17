// Reverse interop check: the WEB APP's crypto must decrypt and verify a message the DART code encrypted.
// The Dart test (test/envelope_test.dart) writes build/dart_envelope.json; run from the repo root afterwards:
//   node apps/flutter_app/tool/verify_dart_envelope.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decryptEnvelope, parse, safetyCode } from "../../web/src/e2ee/envelope.ts";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(join(here, "..", "test", "fixtures", "web_vectors.json"), "utf8"));
const dart = JSON.parse(readFileSync(join(here, "..", "build", "dart_envelope.json"), "utf8"));
const subtle = globalThis.crypto.subtle;

const r = vectors.nodeRecipient;
const me = {
  deviceId: r.deviceId,
  agreement: { privateKey: await subtle.importKey("jwk", r.jwk.agreement, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) },
  signing: null,
};
let failed = 0;
for (const m of dart.messages) {
  const res = await decryptEnvelope({ envelope: parse(m.content), chatId: dart.chatId, senderId: dart.senderId, me, senderSigningKey: dart.senderSigningKey });
  const ok = res.ok && res.verified && res.text === m.plaintext;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  web decrypts + verifies Dart message ${JSON.stringify(m.plaintext.slice(0, 30))}  ${ok ? "" : JSON.stringify(res)}`);
}
// A tampered Dart message must be rejected by the web code.
const env = parse(dart.messages[0].content);
env.ct = env.ct.slice(0, -4) + (env.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
const tampered = await decryptEnvelope({ envelope: env, chatId: dart.chatId, senderId: dart.senderId, me, senderSigningKey: dart.senderSigningKey });
const tamperOk = !tampered.ok && tampered.reason === "BAD_SIGNATURE";
if (!tamperOk) failed++;
console.log(`${tamperOk ? "PASS" : "FAIL"}  web rejects a tampered Dart message (${tampered.ok ? "accepted!" : tampered.reason})`);
// The safety code computed in Dart must match the web's.
const code = await safetyCode(dart.safety.a, dart.safety.b);
const codeOk = code === dart.safety.code;
if (!codeOk) failed++;
console.log(`${codeOk ? "PASS" : "FAIL"}  Dart safety code matches the web (${code.slice(0, 11)}…)`);
if (failed) {
  console.error(`${failed} interop check(s) failed`);
  process.exit(1);
}
console.log("All Dart -> web interop checks passed.");
