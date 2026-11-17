// End-to-end: two browsers, real WebRTC call, on-device Whisper captions, typed translation,
// verified sign-video lookup + fallback, MediaPipe hand-tracking start-up, call history.
import { chromium } from "playwright-core";

const out = process.argv[2];
const wav = process.argv[3];
const WEB = "http://localhost:5173";
const API = "http://localhost:3000";
/** API access as a real user (the API now requires a bearer token). */
async function tokenFor(phone) {
  const r = await fetch("http://localhost:3000/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json", connection: "close" }, body: JSON.stringify({ phone, password: "Test@1234", client: "native" }) });
  return (await r.json()).accessToken;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function signIn(phone, tag, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon/.test(m.text())) console.log(`CONSOLE ${tag}:`, m.text().slice(0, 200)); });
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForTimeout(4500); // brand splash
  return page;
}

const ravi = await signIn("9111100002", "ravi", "dark");
const asha = await signIn("9111100001", "asha", "light");

// --- Ravi calls Asha ---
await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
await ravi.waitForTimeout(800);
ravi.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("RAVI CONSOLE:", m.text().slice(0, 200)); });
console.log("video btn disabled:", await ravi.locator('[aria-label="Video Call"]').isDisabled(), "| header:", await ravi.locator(".header-title").innerText().catch(() => "none"));
await ravi.click('[aria-label="Video Call"]');
await ravi.waitForTimeout(2500);
await ravi.screenshot({ path: `${out}/0-ravi-after-click.png` });
console.log('ravi ring card:', await ravi.locator('.call-ring-card').allInnerTexts());
console.log('ravi chat rows:', await ravi.locator('.chat-summary-item').allInnerTexts());
const ring = await asha.waitForSelector(".call-ring-card", { timeout: 20000 }).then(() => true).catch(() => false);
check("Incoming call rings on the other browser", ring);
await asha.screenshot({ path: `${out}/1-asha-incoming.png` });
if (!ring) { await asha.screenshot({ path: `${out}/0-asha.png` }); await browser.close(); process.exit(1); }
await asha.click('[aria-label="Accept video call"]');

await ravi.waitForSelector(".call-screen", { timeout: 15000 });
await asha.waitForSelector(".call-screen", { timeout: 15000 });

async function remoteVideoLive(page) {
  for (let i = 0; i < 30; i++) {
    const v = await page.evaluate(() => {
      const el = document.querySelector(".call-stage .call-tile:first-child video");
      return el ? { w: el.videoWidth, t: el.currentTime, ready: el.readyState } : null;
    });
    if (v && v.w > 0 && v.t > 0.3) return v;
    await page.waitForTimeout(500);
  }
  return null;
}
const rv = await remoteVideoLive(ravi);
const av = await remoteVideoLive(asha);
check("Ravi receives Asha's live video over WebRTC", !!rv, rv ? `${rv.w}px, t=${rv.t.toFixed(1)}s` : "no frames");
check("Asha receives Ravi's live video over WebRTC", !!av, av ? `${av.w}px, t=${av.t.toFixed(1)}s` : "no frames");
const status = await ravi.locator(".call-peer span").innerText();
check("Call shows connected timer", /^\d+:\d\d$/.test(status.trim()), status);
await ravi.waitForTimeout(2500);
await ravi.screenshot({ path: `${out}/2-ravi-in-call.png` });

// --- Typed caption from Asha -> Ravi ---
await asha.fill(".cp-type input", "Nice to meet you");
await asha.click(".cp-type button");
const gotTyped = await ravi.waitForSelector(".tr-entry.peer .tr-text:has-text('Nice to meet you')", { timeout: 8000 }).then(() => true).catch(() => false);
check("Typed caption from Asha is delivered to Ravi", gotTyped);

// --- Sign-video lookup: no verified video -> explicit fallback on Asha's side (ISL user) ---
await ravi.fill(".cp-type input", "Where is the station?");
await ravi.click(".cp-type button");
const fb = await asha.waitForSelector(".cp-fallback", { timeout: 8000 }).then((h) => h.innerText()).catch(() => "");
check("Without a verified ISL video, Asha sees an honest fallback (no invented video)", /No verified ISL video/.test(fb), fb.replace(/\s+/g, " ").slice(0, 120));

// --- Upload a TEST clip, verify it as admin, check it plays for the exact sentence, then delete it ---
const ashaToken = await tokenFor("9111100001");
const ashaId = (await (await fetch(`${API}/users/search?q=9111100001`, { headers: { Authorization: `Bearer ${ashaToken}` } })).json())[0].id;
// Record a short clip from the (fake) camera in the page, then upload it as Asha.
const clipB64 = await asha.evaluate(async () => {
  const s = await navigator.mediaDevices.getUserMedia({ video: true });
  const rec = new MediaRecorder(s, { mimeType: "video/webm" });
  const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start();
  await new Promise((r) => setTimeout(r, 1500));
  rec.stop();
  await done;
  s.getTracks().forEach((t) => t.stop());
  const buf = new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
});
const clipForm = new FormData();
clipForm.append("file", new Blob([Buffer.from(clipB64, "base64")], { type: "video/webm" }), "e2e-test.webm");
Object.entries({
  signLanguageId: "isl", unit: "SENTENCE", phraseText: "How are you?", gloss: "TEST-ONLY", meaning: "Automated test clip (fake camera pattern, not a real signer)",
  signerId: "e2e-test", quality: "LOW", license: "Test only", provenance: "Automated end-to-end test; deleted after the test", consentConfirmed: "true", uploadedBy: ashaId,
}).forEach(([k, v]) => clipForm.append(k, v));
const clipRes = await fetch(`${API}/sign-videos`, { method: "POST", headers: { Authorization: `Bearer ${ashaToken}` }, body: clipForm });
const testClip = { status: clipRes.status, body: await clipRes.json() };
check("Signing video upload accepted as UNVERIFIED", testClip.status === 201 && testClip.body.verificationStatus === "UNVERIFIED", `HTTP ${testClip.status}`);
const admin = await (await fetch(`${API}/auth/admin/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) })).json();
await fetch(`${API}/admin/sign-videos/${testClip.body.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-token": admin.adminToken }, body: JSON.stringify({ status: "VERIFIED", note: "e2e" }) });
await ravi.fill(".cp-type input", "How are you?");
await ravi.click(".cp-type button");
const vidOk = await asha.waitForSelector(".cp-signvideo video", { timeout: 8000 }).then(() => true).catch(() => false);
await asha.waitForTimeout(1200);
const playing = await asha.evaluate(() => { const v = document.querySelector(".cp-signvideo video"); return v ? { t: v.currentTime, err: v.error?.code ?? null } : null; });
check("Verified video plays on Asha's side for the exact sentence", vidOk && playing && playing.err === null, JSON.stringify(playing));
await asha.screenshot({ path: `${out}/3-asha-signing-video.png` });
await fetch(`${API}/admin/sign-videos/${testClip.body.id}`, { method: "DELETE", headers: { "x-admin-token": admin.adminToken } });

// --- Hand tracking (MediaPipe) start-up on Asha's camera ---
// Asha has ISL as her sign language, so detection is switched on automatically when the call connects.
const autoOn = (await asha.getAttribute('[aria-label="Sign and gesture detection"]', "aria-checked")) === "true";
const tracking = await asha.waitForFunction(() => /Running on this device|Error/.test(document.querySelector(".call-panel")?.textContent ?? ""), null, { timeout: 60000 }).then(() => asha.locator(".call-panel .cp-toggle-row").nth(1).innerText()).catch(() => "timeout");
check("Gesture Recognizer auto-starts for the signer, passes SHA-256 check and runs", autoOn && /Running on this device/.test(tracking), tracking.replace(/\s+/g, " ").slice(0, 140));

// --- On-device Whisper captions from Ravi's microphone (fake mic plays a spoken WAV) ---
// Captions now switch on automatically when the other person signs; only click if still off.
if ((await ravi.locator('[aria-label="Speech captions"]').getAttribute('aria-checked')) !== 'true') await ravi.click('[aria-label="Speech captions"]');
console.log("…waiting for Whisper model download + transcription (can take a minute)");
const caption = await asha
  .waitForFunction(() => [...document.querySelectorAll(".tr-entry.peer .tr-text")].some((e) => /how are you today|testing|live captions|hello/i.test(e.textContent ?? "") && !/^How are you\?$/.test(e.textContent ?? "")), null, { timeout: 180000 })
  .then(() => asha.waitForTimeout(30000))
  .then(() => asha.evaluate(() => [...document.querySelectorAll(".tr-entry.peer")].filter((e) => e.textContent.includes("Speech")).map((e) => e.querySelector(".tr-text").textContent)))
  .catch(() => null);
check("Whisper (on Ravi's device) transcribes speech; caption delivered to Asha", !!caption && caption.length > 0, caption ? JSON.stringify(caption) : "no caption");
await asha.screenshot({ path: `${out}/4-asha-captions.png` });
await ravi.screenshot({ path: `${out}/5-ravi-captions.png` });

// --- Hang up + history ---
await ravi.click('[aria-label="End call"]');
const ended = await asha.waitForSelector(".call-ring-card:has-text('Call ended')", { timeout: 8000 }).then(() => true).catch(() => false);
check("Hang-up ends the call on both sides", ended);
const raviToken = await tokenFor("9111100002");
const users = await (await fetch(`${API}/users/search?q=9111100002`, { headers: { Authorization: `Bearer ${raviToken}` } })).json();
const hist = await (await fetch(`${API}/calls?userId=${users[0].id}`, { headers: { Authorization: `Bearer ${raviToken}` } })).json();
check("Call history recorded (ENDED, AI assist used)", hist[0]?.status === "ENDED" && hist[0]?.aiAssistUsed === true, JSON.stringify({ status: hist[0]?.status, ai: hist[0]?.aiAssistUsed }));

// --- Translator page ---
await asha.waitForTimeout(4000);
await asha.locator(".sidebar-nav-btn", { hasText: "Translator" }).click();
await asha.waitForTimeout(1500);
await asha.screenshot({ path: `${out}/6-translator.png`, fullPage: false });
const installed = await asha.locator(".ts-status").allInnerTexts();
// Asha used the hand model; Whisper ran in Ravi's browser, and each browser keeps its own model cache.
check("Translator page reports per-device model state (hand model installed for Asha)", /Installed/.test(installed[0] ?? ""), JSON.stringify(installed));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
