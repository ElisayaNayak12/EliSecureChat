// E2E: during a live WebRTC call, Asha's camera shows REAL photos of hand gestures (MediaPipe sample images).
// Expect: on-device Gesture Recognizer detects them live, auto-sends text, Ravi receives text and it is spoken.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const imgDir = process.argv[3];
const img = (n) => `data:image/jpeg;base64,${readFileSync(join(imgDir, `${n}.jpg`)).toString("base64")}`;
const SEQUENCE = [
  { src: null, ms: 2500 },
  { src: img("thumbs_up"), ms: 3000 },
  { src: null, ms: 2000 },
  { src: img("victory"), ms: 3000 },
  { src: null, ms: 2000 },
  { src: img("thumbs_down"), ms: 3000 },
  { src: null, ms: 2000 },
  { src: img("pointing_up"), ms: 3000 },
  { src: null, ms: 60000 },
];
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

async function signIn(phone, tag, cameraSequence) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  await ctx.addInitScript(() => {
    // Record what the app asks the speech engine to say (headless Chrome has no audio output to listen to).
    window.__spoken = [];
    const synth = window.speechSynthesis;
    if (synth) {
      const orig = synth.speak.bind(synth);
      synth.speak = (u) => { window.__spoken.push(u.text); try { orig(u); } catch {} };
    }
  });
  if (cameraSequence) {
    await ctx.addInitScript((seq) => {
      const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        if (!c || !c.video) return realGUM(c);
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx2d = canvas.getContext("2d");
        const images = await Promise.all(seq.map((s) => new Promise((res) => {
          if (!s.src) return res(null);
          const im = new Image();
          im.onload = () => res(im);
          im.src = s.src;
        })));
        // The sequence starts when the test sets window.__startSequence (after detection is running).
        const draw = () => {
          if (!window.__startSequence) { ctx2d.fillStyle = "#3a4a3e"; ctx2d.fillRect(0, 0, 640, 480); window.__cameraFrame = -1; return; }
          let t = performance.now() - window.__startSequence, i = 0;
          while (i < seq.length - 1 && t > seq[i].ms) { t -= seq[i].ms; i++; }
          ctx2d.fillStyle = "#3a4a3e";
          ctx2d.fillRect(0, 0, 640, 480);
          const im = images[i];
          if (im) {
            const s = Math.min(640 / im.width, 480 / im.height);
            ctx2d.drawImage(im, (640 - im.width * s) / 2, (480 - im.height * s) / 2, im.width * s, im.height * s);
          }
          window.__cameraFrame = i;
        };
        setInterval(draw, 33);
        draw();
        const stream = canvas.captureStream(30);
        if (c.audio) (await realGUM({ audio: true })).getAudioTracks().forEach((t) => stream.addTrack(t));
        return stream;
      };
    }, cameraSequence);
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForTimeout(4500);
  return page;
}

const ravi = await signIn("9111100002", "ravi", null);
const asha = await signIn("9111100001", "asha", SEQUENCE);
if (process.env.THROTTLE) {
  // Simulate a low-end device: slow Asha's CPU down (Chrome DevTools CPU throttling).
  const cdp = await asha.context().newCDPSession(asha);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
  console.log(`CPU throttled ${process.env.THROTTLE}x on Asha's device`);
}

if (process.env.PREWAIT) await asha.waitForTimeout(Number(process.env.PREWAIT)); // Asha has been signed in for a while
await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
await ravi.waitForTimeout(600);
await ravi.click('[aria-label="Video Call"]');
await asha.waitForSelector(".call-ring-card", { timeout: 10000 });
await asha.click('[aria-label="Accept video call"]');
if (process.env.IMMEDIATE) await asha.evaluate(() => { window.__startSequence = performance.now(); }); // gestures start the moment the call is accepted
await asha.waitForSelector(".call-screen", { timeout: 15000 });
await ravi.waitForSelector(".call-screen", { timeout: 15000 });

if (process.env.TIMING) {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < 12000) {
    const phase = (await asha.locator('.call-screen').getAttribute('data-phase').catch(() => '')) + ' ' + (await asha.locator('.call-peer span').innerText().catch(() => ''));
    const badge = await asha.locator('.call-detect-badge').innerText().catch(() => '(no badge)');
    const line = phase + ' | ' + badge;
    if (line !== last) { console.log(String(Date.now() - t0).padStart(5), 'ms', line); last = line; }
    await asha.waitForTimeout(100);
  }
  await browser.close(); process.exit(0);
}
// Detection must switch itself on for Asha (she has ISL set as her sign language).
const autoOn = await asha.waitForFunction(() => document.querySelector('[aria-label="Sign and gesture detection"]')?.getAttribute("aria-checked") === "true", null, { timeout: 15000 }).then(() => true).catch(() => false);
check("Sign & gesture detection turns on automatically for the Deaf user", autoOn);

const ready = process.env.IMMEDIATE ? true : await asha.waitForFunction(() => /No hands in view/.test(document.querySelector(".call-detect-badge")?.textContent ?? ""), null, { timeout: 60000 }).then(() => true).catch(() => false);
check("Vision model loads (checksum verified) and is watching the live video", ready);
if (!process.env.IMMEDIATE) await asha.evaluate(() => { window.__startSequence = performance.now(); });

// Watch Asha's live badge while the camera cycles through the gestures.
const seen = new Set();
const t0 = Date.now();
let shotTaken = false;
while (Date.now() - t0 < 45000) {
  const badge = await asha.locator(".call-detect-badge").innerText().catch(() => "");
  for (const g of ["Thumbs up", "Victory", "Thumbs down", "Pointing up"]) if (badge.includes(g)) seen.add(g);
  if (!shotTaken && badge.includes("Thumbs up")) {
    shotTaken = true;
    await asha.screenshot({ path: `${out}/g1-asha-live-detection.png` });
    await ravi.screenshot({ path: `${out}/g2-ravi-sees-asha.png` });
  }
  const frame = await asha.evaluate(() => window.__cameraFrame);
  if (frame >= 8 && seen.size >= 3) break;
  await asha.waitForTimeout(200);
}
check("Vision model detects real hand gestures live in the call (badge)", seen.size >= 3, [...seen].join(", "));

await ravi.waitForTimeout(1500);
if (process.env.DEBUG) {
  console.log("asha detections:", await asha.locator(".cp-detection").allInnerTexts());
  console.log("asha reject note:", await asha.locator(".cp-reject").allInnerTexts());
  console.log("asha errors:", await asha.locator(".call-panel .cp-toggle-row").nth(1).innerText());
}
const received = await ravi.evaluate(() =>
  [...document.querySelectorAll(".tr-entry.peer")].filter((e) => e.textContent.includes("Sign → text")).map((e) => e.querySelector(".tr-text").textContent),
);
check("Detected signs arrive at the hearing person as text", received.length >= 3, JSON.stringify(received));
const spoken = await ravi.evaluate(() => window.__spoken);
check("…and are spoken aloud on the hearing person's device", spoken.length >= 3 && received.every((t) => spoken.includes(t)), JSON.stringify(spoken));
const expected = ["Yes", "Peace", "No", "One moment"];
check("Each gesture maps to its English meaning (default mapping)", expected.filter((e) => received.includes(e)).length >= 3, `expected ⊇ 3 of ${JSON.stringify(expected)}`);
const overlay = await ravi.locator(".call-live-caption").innerText().catch(() => "");
check("Hearing person's caption overlay labels it as signing", /\(signing\)/.test(overlay), overlay);
const sentList = await asha.locator(".cp-detection.sent").count();
check("Deaf person sees what was detected and sent (with Correct option)", sentList >= 3 && (await asha.locator(".cp-detection.sent button:has-text('Correct')").count()) >= 1, `${sentList} sent`);

// Manual correction path
await asha.locator(".cp-detection.sent button:has-text('Correct')").first().click();
await asha.fill(".cp-suggestion input", "Yes, I agree");
await asha.click(".cp-suggestion .btn-primary");
const corrected = await ravi.waitForSelector(".tr-entry.peer:has-text('Yes, I agree')", { timeout: 6000 }).then((h) => h.innerText()).catch(() => "");
check("A correction is delivered and marked as corrected", /corrected/i.test(corrected), corrected.replace(/\s+/g, " "));

await asha.screenshot({ path: `${out}/g3-asha-panel.png` });
await ravi.screenshot({ path: `${out}/g4-ravi-transcript.png` });
await ravi.click('[aria-label="End call"]');
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
