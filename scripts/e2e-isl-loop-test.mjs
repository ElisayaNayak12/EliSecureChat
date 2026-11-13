// FULL LOOP e2e: consent -> record via UI -> admin approve -> export -> Python training -> publish -> live recognition in a call -> cleanup.
// The "signs" are real hand PHOTOS (MediaPipe samples) moved around on a canvas camera. This verifies the pipeline,
// NOT ISL accuracy. All test data and the test model are deleted at the end.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [outArg, imgDir, pythonExe, aiDir] = process.argv.slice(2);
const out = resolve(outArg);
const API = "http://localhost:3000";
/** API access as a real user (the API now requires a bearer token). */
async function tokenFor(phone) {
  const r = await fetch("http://localhost:3000/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json", connection: "close" }, body: JSON.stringify({ phone, password: "Test@1234", client: "native" }) });
  return (await r.json()).accessToken;
}

const img = (n) => `data:image/jpeg;base64,${readFileSync(join(imgDir, `${n}.jpg`)).toString("base64")}`;
const PHOTOS = { thumbs_up: img("thumbs_up"), victory: img("victory"), pointing_up: img("pointing_up"), thumbs_down: img("thumbs_down") };
const WORDS = { GOOD: "thumbs_up", FINE: "victory", WAIT: "pointing_up", BAD: "thumbs_down" };
const SIGNERS = [{ name: "E2E Test Signer A", scale: 0.95, dx: -40 }, { name: "E2E Test Signer B", scale: 1.05, dx: 30 }, { name: "E2E Test Signer C", scale: 0.85, dx: 0 }, { name: "E2E Test Signer D", scale: 1.0, dx: 50 }];
const PER_WORD = 4;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

/** Camera = canvas showing window.__photo, swaying slowly (so each recording has motion), styled per signer. */
async function photoCamera(ctx) {
  await ctx.addInitScript((photos) => {
    window.__photo = null;
    window.__style = { scale: 1, dx: 0 };
    const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const imgs = {};
    for (const [k, v] of Object.entries(photos)) { const im = new Image(); im.src = v; imgs[k] = im; }
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (!c || !c.video) return realGUM(c);
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const g = canvas.getContext("2d");
      setInterval(() => {
        g.fillStyle = "#3a4a3e"; g.fillRect(0, 0, 640, 480);
        const im = window.__photo && imgs[window.__photo];
        if (im && im.complete) {
          const t = performance.now() / 1000;
          const s = Math.min(640 / im.width, 480 / im.height) * window.__style.scale;
          const x = (640 - im.width * s) / 2 + window.__style.dx + Math.sin(t * 2.2) * 25;
          const y = (480 - im.height * s) / 2 + Math.cos(t * 1.7) * 15;
          g.drawImage(im, x, y, im.width * s, im.height * s);
        }
      }, 33);
      const stream = canvas.captureStream(30);
      if (c.audio) (await realGUM({ audio: true })).getAudioTracks().forEach((t) => stream.addTrack(t));
      return stream;
    };
  }, PHOTOS);
}

async function signIn(phone, withCamera) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["camera", "microphone"] });
  if (withCamera) await photoCamera(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForTimeout(4500);
  return page;
}

const asha = await signIn("9111100001", true);
const ashaToken = await tokenFor("9111100001");
const U = { Authorization: `Bearer ${ashaToken}` };
const ashaId = (await (await fetch(`${API}/users/search?q=9111100001`, { headers: U })).json())[0].id;
const admin = (await (await fetch(`${API}/auth/admin/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) })).json()).adminToken;
const A = { "x-admin-token": admin, "Content-Type": "application/json" };

let consents = [];
let published = null;
let recorded = 0;
try {
// ---------- 1. consent + recording through the Translator UI ----------
await asha.locator(".sidebar-nav-btn", { hasText: "Translator" }).click();
await asha.waitForTimeout(1000);
await asha.click("text=Turn on camera");
await asha.waitForFunction(() => /fps/.test(document.querySelector(".ts-camera")?.textContent ?? ""), null, { timeout: 60000 });

const card = asha.locator(".ts-card", { hasText: "Contribute to the" });
for (const s of SIGNERS) {
  await card.locator("button", { hasText: "Add a signer" }).click();
  await card.locator("label:has-text('Signer') input").first().fill(s.name);
  const boxes = card.locator(".ds-form input[type=checkbox]");
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await card.locator("button", { hasText: "Record consent" }).click();
  await asha.waitForTimeout(600);
}
consents = (await (await fetch(`${API}/dataset/consents?userId=${ashaId}`, { headers: U })).json()).filter((c) => c.signerName.startsWith("E2E Test Signer") && !c.revokedAt);
check("Consent recorded for each test signer (pseudonymous ids)", consents.length === SIGNERS.length, consents.map((c) => c.signerId).join(", "));

const recordStart = Date.now();
for (const s of SIGNERS) {
  const consent = consents.find((c) => c.signerName === s.name);
  await card.locator(".ds-record-row label:has-text('Signer') select").selectOption(consent.id);
  await asha.evaluate((st) => { window.__style = st; }, { scale: s.scale, dx: s.dx });
  for (const [word, photo] of Object.entries(WORDS)) {
    await card.locator(".ds-record-row label:has-text('Word') select").selectOption(word);
    for (let k = 0; k < PER_WORD; k++) {
      await card.locator("button", { hasText: "Record this word" }).click();
      await asha.waitForTimeout(2200); // countdown
      await asha.evaluate((p) => { window.__photo = p; }, photo);
      await asha.waitForTimeout(1600); // "signing"
      await asha.evaluate(() => { window.__photo = null; }); // hands lowered -> capture ends
      await asha.waitForFunction(() => !/Recording…/.test(document.querySelector(".ds-record-row button")?.textContent ?? ""), null, { timeout: 15000 });
      const msg = await card.locator(".ts-msg, .ts-error").last().innerText().catch(() => "");
      if (/Saved a/.test(msg)) recorded++;
      else console.log(`   not saved (${word}, ${s.name}): ${msg}`);
    }
  }
}
const total = SIGNERS.length * Object.keys(WORDS).length * PER_WORD;
check("Signs recorded through the app UI as landmark samples", recorded >= total * 0.75, `${recorded}/${total} saved in ${Math.round((Date.now() - recordStart) / 1000)} s`);
await asha.screenshot({ path: `${out}/l1-dataset-card.png`, fullPage: true });

// ---------- 2. admin review + export ----------
const pending = await (await fetch(`${API}/admin/dataset/samples?status=PENDING`, { headers: A })).json();
const mine = pending.filter((p) => consents.some((c) => c.id === p.consentId));
for (const p of mine) await fetch(`${API}/admin/dataset/samples/${p.id}`, { method: "PATCH", headers: A, body: JSON.stringify({ status: "APPROVED" }) });
const exp = await (await fetch(`${API}/admin/dataset/export?language=isl`, { headers: A })).json();
const testSamples = exp.samples.filter((s) => consents.some((c) => c.signerId === s.signerId));
check("Admin approval + export contains the recordings (no real names)", testSamples.length === mine.length && !JSON.stringify(exp).includes("E2E Test Signer"), `${testSamples.length} samples, ${exp.signers.length} signers`);
mkdirSync(join(out, "run"), { recursive: true });
const exportPath = join(out, "export.json");
writeFileSync(exportPath, JSON.stringify({ ...exp, samples: testSamples, vocabulary: exp.vocabulary }));

// ---------- 3. Python training ----------
console.log("…training (Python/PyTorch)");
const trainLog = execFileSync(pythonExe, ["-m", "signconnect_ai.train", "--data", exportPath, "--out", join(out, "run"), "--epochs", "120", "--version", "0.0.0-e2e-test"], { cwd: aiDir, encoding: "utf8" });
console.log(trainLog.split("\n").filter((l) => /accuracy|Selected|Held-out|ONNX|Split/.test(l)).map((l) => "   " + l).join("\n"));
const manifest = JSON.parse(readFileSync(join(out, "run", "manifest.json"), "utf8"));
check("Training ran signer-independent and exported a verified ONNX model", manifest.metrics.signerIndependent === true && manifest.labels.length === 4, `test accuracy ${manifest.metrics.testAccuracy}, threshold ${manifest.threshold}`);

// ---------- 4. publish ----------
const form = new FormData();
form.append("model", new Blob([readFileSync(join(out, "run", "model.onnx"))]), "model.onnx");
form.append("manifest", new Blob([readFileSync(join(out, "run", "manifest.json"))], { type: "application/json" }), "manifest.json");
form.append("note", "E2E TEST MODEL from photo stand-ins; delete after test");
// A fresh connection: the previous keep-alive socket went stale while training blocked this process.
const upload = () => fetch(`${API}/admin/models`, { method: "POST", headers: { "x-admin-token": admin, connection: "close" }, body: form });
published = await (await upload().catch(() => upload())).json();
check("Model published through the registry with checksum", published.status === "PUBLISHED" && published.sha256?.length === 64, `v${published.manifest?.version}`);

// ---------- 5. live recognition in a call ----------
const ravi = await signIn("9111100002", false);
await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
await ravi.waitForTimeout(600);
await ravi.click('[aria-label="Video Call"]');
const rang = await asha.waitForSelector(".call-ring-card", { timeout: 20000 }).then(() => true).catch(() => false);
if (!rang) {
  console.log("ring diag:", JSON.stringify({ ravi: await ravi.locator(".call-ring-card").allInnerTexts(), ashaUrl: asha.url(), ashaSocket: await asha.evaluate(() => document.body.innerText.slice(0, 300)) }));
  await asha.screenshot({ path: `${out}/ring-fail-asha.png` });
  throw new Error("Incoming call did not ring on Asha's side within 20 s");
}
await asha.click('[aria-label="Accept video call"]');
await asha.waitForSelector(".call-screen", { timeout: 15000 });
const status = await asha.waitForFunction(() => /model v0\.0\.0-e2e-test: 4 signs|unavailable/.test(document.querySelector(".cp-model-status")?.textContent ?? ""), null, { timeout: 30000 }).then(() => asha.locator(".cp-model-status").innerText()).catch(() => "no status");
check("Call loads the published model on the device (checksum verified)", /4 signs/.test(status), status);
await asha.locator(".cp-check", { hasText: "Also use built-in gestures" }).locator("input").uncheck(); // only the trained model
await asha.evaluate(() => { window.__style = { scale: 0.92, dx: 10 }; });
for (const photo of ["thumbs_up", "victory", "pointing_up", "thumbs_down"]) {
  await asha.evaluate((p) => { window.__photo = p; }, photo);
  await asha.waitForTimeout(1800);
  await asha.evaluate(() => { window.__photo = null; });
  await asha.waitForTimeout(1300);
}
await ravi.waitForTimeout(1500);
const got = await ravi.evaluate(() => [...document.querySelectorAll(".tr-entry.peer")].map((e) => e.textContent ?? "").filter((t) => t.includes("isl-model")));
const texts = got.map((t) => (t.match(/(Good|I am fine|Wait|Bad)/) ?? [""])[0]);
check("Trained model recognises signs live in the call; text reaches the hearing person", got.length >= 2, JSON.stringify(texts));
await asha.screenshot({ path: `${out}/l2-asha-call-model.png` });
await ravi.screenshot({ path: `${out}/l3-ravi-received.png` });
await ravi.click('[aria-label="End call"]');

} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
// ---------- 6. cleanup: remove the test model and all test recordings ----------
if (published?.id) await fetch(`${API}/admin/models/${published.id}`, { method: "DELETE", headers: A });
let deleted = 0;
for (const c of consents) deleted += (await (await fetch(`${API}/dataset/consents/${c.id}/revoke`, { method: "POST", headers: { "Content-Type": "application/json", ...U, connection: "close" }, body: JSON.stringify({ userId: ashaId }) })).json()).deletedSamples;
const after = await (await fetch(`${API}/models/sign-recognition?language=isl`)).json();
check("Cleanup: test model deleted and test signers' recordings erased via consent withdrawal", after.model === null && deleted === recorded, `${deleted} samples deleted`);
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
