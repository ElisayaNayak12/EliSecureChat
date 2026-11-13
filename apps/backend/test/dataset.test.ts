/**
 * Consent-based ISL dataset + trained-model registry: validation, ownership, consent revocation,
 * export contents, and model publish/rollback. Boots the real app against a throwaway store.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bootApp, type TestApp } from "./helpers";
import { STARTER_VOCABULARY, validateManifest, validateSample } from "../src/dataset/dataset-rules";

let t: TestApp;
let base = "";
let alice = "", bob = "", admin = "";
let aliceTok = "", bobTok = "";

before(async () => {
  t = await bootApp("dataset");
  base = t.base;
  alice = t.createUser("Alice", "9300000001");
  bob = t.createUser("Bob", "9300000002");
  aliceTok = t.tokenFor(alice);
  bobTok = t.tokenFor(bob);
  admin = t.store.createAdminSession();
});

after(() => t.close());

const dir = () => t.dir;

/** Calls as Alice unless an Authorization header is given. */
const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceTok}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }).then(
    async (r) => ({ status: r.status, body: await r.json().catch(() => null) }),
  );

/** A plausible recorded sign: one hand moving across the frame, 30 frames at ~20 fps. */
function frames(n = 30, shift = 0) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 50,
    hands: [{ h: "R", s: 0.95, p: Array.from({ length: 63 }, (_, k) => (k % 3 === 2 ? 0 : 0.3 + (k % 7) * 0.02 + (i / n) * 0.3 + shift)) }],
  }));
}

/* ---------------- pure rules ---------------- */

test("validateSample accepts a well-formed sign and rejects malformed or handless ones", () => {
  const ok = validateSample({ consentId: "c", gloss: "thank you", language: "isl", frames: frames() });
  assert.equal(ok.value?.gloss, "THANK-YOU");
  assert.equal(ok.value?.handFrameRatio, 1);
  assert.match(validateSample({ consentId: "c", gloss: "X", language: "isl", frames: frames(3) }).issues[0], /frames must be/);
  const noHands = frames().map((f) => ({ ...f, hands: [] }));
  assert.match(validateSample({ consentId: "c", gloss: "X", language: "isl", frames: noHands }).issues[0], /must contain a hand/);
  const bad = frames();
  bad[5].hands[0].p = [1, 2, 3];
  assert.match(validateSample({ consentId: "c", gloss: "X", language: "isl", frames: bad }).issues[0], /invalid hand/);
  const back = frames();
  back[4].t = -1;
  assert.match(validateSample({ consentId: "c", gloss: "X", language: "isl", frames: back }).issues[0], /increasing t/);
});

test("validateManifest requires honest metrics and the app's feature format", () => {
  const good = {
    task: "SIGN_RECOGNITION", language: "isl", version: "0.1.0", architecture: "bigru", featureVersion: 1, featureDim: 132,
    sequenceLength: 32, labels: [{ gloss: "A", meaning: "a" }, { gloss: "B", meaning: "b" }], threshold: 0.6,
    metrics: { testAccuracy: 0.9, validationAccuracy: 0.9, signerIndependent: true, trainSamples: 10, testSamples: 4, signers: 3 }, trainedAt: "2026-11-10",
  };
  assert.ok(validateManifest(good).value);
  assert.ok(validateManifest({ ...good, featureVersion: 2 }).issues.some((i) => /featureVersion/.test(i)));
  assert.ok(validateManifest({ ...good, metrics: {} }).issues.some((i) => /honest evaluation/.test(i)));
});

/* ---------------- HTTP ---------------- */

test("the ISL vocabulary is seeded with labels on first use", async () => {
  const r = await json("GET", "/dataset/vocabulary?language=isl");
  assert.equal(r.body.length, STARTER_VOCABULARY.length);
  assert.ok(r.body.some((v: { gloss: string }) => v.gloss === "THANK-YOU"));
});

let consentId = "";
test("consent must include agreement to recording AND training", async () => {
  const bad = await json("POST", "/dataset/consents", { userId: alice, signerName: "Asha", language: "isl", agreeRecording: true, agreeTraining: false });
  assert.equal(bad.status, 400);
  const ok = await json("POST", "/dataset/consents", { userId: alice, signerName: "Asha K", language: "isl", agreeRecording: true, agreeTraining: true, isDeafOrNativeSigner: true, region: "Pune" });
  assert.equal(ok.status, 201);
  assert.match(ok.body.signerId, /^signer-[0-9a-f]{8}$/);
  consentId = ok.body.id;
});

let sampleId = "";
test("samples: large landmark bodies accepted; vocabulary, ownership and consent enforced", async () => {
  const big = frames(150); // ~200 KB of JSON
  const ok = await json("POST", "/dataset/samples", { userId: alice, consentId, gloss: "THANK-YOU", language: "isl", frames: big });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.status, "PENDING");
  assert.equal(ok.body.frameCount, 150);
  sampleId = ok.body.id;
  assert.equal((await json("POST", "/dataset/samples", { userId: alice, consentId, gloss: "NOT-A-WORD", language: "isl", frames: frames() })).status, 400);
  assert.equal((await json("POST", "/dataset/samples", { userId: bob, consentId, gloss: "YES", language: "isl", frames: frames() }, { Authorization: `Bearer ${bobTok}` })).status, 403, "someone else's consent");
  assert.equal((await json("POST", "/dataset/samples", { userId: bob, consentId, gloss: "YES", language: "isl", frames: frames() })).status, 403, "cannot claim to be Bob");
  const stats = await json("GET", "/dataset/stats?language=isl");
  assert.equal(stats.body.totals.pending, 1);
  assert.equal(stats.body.glosses.find((g: { gloss: string }) => g.gloss === "THANK-YOU").pending, 1);
});

test("admin review gates the export; export contains pseudonymous signers only", async () => {
  assert.equal((await json("GET", "/admin/dataset/export?language=isl")).status, 401);
  let exp = await json("GET", "/admin/dataset/export?language=isl", undefined, { "x-admin-token": admin });
  assert.equal(exp.body.samples.length, 0, "pending samples are not exported");
  await json("PATCH", `/admin/dataset/samples/${sampleId}`, { status: "APPROVED" }, { "x-admin-token": admin });
  exp = await json("GET", "/admin/dataset/export?language=isl", undefined, { "x-admin-token": admin });
  assert.equal(exp.body.samples.length, 1);
  assert.equal(exp.body.samples[0].frames.length, 150);
  assert.equal(exp.body.featureDim, 132);
  assert.deepEqual(exp.body.vocabulary, [{ gloss: "THANK-YOU", meaning: "Thank you" }]);
  assert.equal(JSON.stringify(exp.body).includes("Asha K"), false, "real names never leave the consent record");
  const frames = await json("GET", `/admin/dataset/samples/${sampleId}/frames`, undefined, { "x-admin-token": admin });
  assert.equal(frames.body.length, 150);
});

test("revoking consent deletes the signer's samples and files", async () => {
  assert.equal((await json("POST", `/dataset/consents/${consentId}/revoke`, { userId: bob }, { Authorization: `Bearer ${bobTok}` })).status, 403);
  const r = await json("POST", `/dataset/consents/${consentId}/revoke`, { userId: alice });
  assert.equal(r.body.deletedSamples, 1);
  assert.equal(readdirSync(join(dir(), "dataset", "samples")).length, 0);
  const exp = await json("GET", "/admin/dataset/export?language=isl", undefined, { "x-admin-token": admin });
  assert.equal(exp.body.samples.length, 0);
  assert.equal((await json("POST", "/dataset/samples", { userId: alice, consentId, gloss: "YES", language: "isl", frames: frames() })).status, 400, "revoked consent can't record");
});

/* ---------------- model registry ---------------- */

function modelForm(version: string, extra: Record<string, unknown> = {}) {
  const manifest = {
    task: "SIGN_RECOGNITION", language: "isl", version, architecture: "bigru", featureVersion: 1, featureDim: 132, sequenceLength: 32,
    labels: [{ gloss: "YES", meaning: "Yes" }, { gloss: "NO", meaning: "No" }], threshold: 0.6,
    metrics: { testAccuracy: 0.8, validationAccuracy: 0.85, signerIndependent: true, trainSamples: 40, testSamples: 10, signers: 4 },
    trainedAt: "2026-11-10T00:00:00Z", ...extra,
  };
  const form = new FormData();
  form.append("model", new Blob([new Uint8Array(500).fill(7)]), "model.onnx");
  form.append("manifest", new Blob([JSON.stringify(manifest)], { type: "application/json" }), "manifest.json");
  return form;
}

test("model upload: validated, checksummed, one published per language, rollback works", async () => {
  const none = await json("GET", "/models/sign-recognition?language=isl");
  assert.equal(none.body.model, null);
  const bad = await fetch(`${base}/admin/models`, { method: "POST", headers: { "x-admin-token": admin }, body: modelForm("0.0.1", { featureVersion: 9 }) });
  assert.equal(bad.status, 400);
  const v1 = await (await fetch(`${base}/admin/models`, { method: "POST", headers: { "x-admin-token": admin }, body: modelForm("0.1.0") })).json();
  const v2 = await (await fetch(`${base}/admin/models`, { method: "POST", headers: { "x-admin-token": admin }, body: modelForm("0.2.0") })).json();
  assert.equal(v2.sha256.length, 64);
  let cur = await json("GET", "/models/sign-recognition?language=isl");
  assert.equal(cur.body.model.manifest.version, "0.2.0");
  assert.equal((await fetch(`${base}/models/${v1.id}/file`)).status, 404, "withdrawn models are not served");
  await json("PATCH", `/admin/models/${v1.id}`, { status: "PUBLISHED" }, { "x-admin-token": admin }); // rollback
  cur = await json("GET", "/models/sign-recognition?language=isl");
  assert.equal(cur.body.model.manifest.version, "0.1.0");
  const file = await fetch(base + cur.body.model.url.replace("/api", ""));
  assert.equal((await file.arrayBuffer()).byteLength, 500);
  await json("DELETE", `/admin/models/${v2.id}`, undefined, { "x-admin-token": admin });
  assert.equal(existsSync(join(dir(), "dataset", "models", `${v2.id}.onnx`)), false);
});

test("the language registry reports a published model live, and nothing when withdrawn", async () => {
  const pack = await json("GET", "/languages/sign/isl");
  assert.equal(pack.body.recognitionModel.version, "0.1.0"); // v1 is published after the rollback above
  assert.equal(pack.body.evaluation.signerIndependent, true);
  const models = await json("GET", "/admin/models", undefined, { "x-admin-token": admin });
  for (const m of models.body) await json("PATCH", `/admin/models/${m.id}`, { status: "WITHDRAWN" }, { "x-admin-token": admin });
  const after = await json("GET", "/languages/sign/isl");
  assert.equal(after.body.recognitionModel, null);
  assert.equal(after.body.videoLibrary.verifiedClipCount, 0);
});
