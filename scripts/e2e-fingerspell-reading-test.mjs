// Live fingerspelling READING on a real call: Ravi's camera shows the ASL letters C, A, B (a video made from the
// app's letter photos), the app reads them with MediaPipe + the letter reader, builds "CAB" on the spelling bar
// and sends it to Asha after the pause.
// Usage: node e2e-fingerspell-reading-test.mjs <web-url> <letters.y4m>   (Ravi's sign language must be ASL)
import { chromium } from "playwright-core";

const [WEB = "http://localhost:5173", VIDEO] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};
const launch = (video) =>
  chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", ...(video ? [`--use-file-for-fake-video-capture=${video}`] : [])],
  });
const raviBrowser = await launch(VIDEO);
const ashaBrowser = await launch(null);
async function signIn(browser, phone, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForSelector(".main-app-layout-shell", { state: "attached", timeout: 15000 });
  await page.waitForSelector(".brand-splash", { state: "detached", timeout: 8000 }).catch(() => {});
  return page;
}
try {
  const ravi = await signIn(raviBrowser, "9111100002", "ravi");
  const asha = await signIn(ashaBrowser, "9111100001", "asha");
  await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
  await ravi.waitForTimeout(800);
  await ravi.click('[aria-label="Video Call"]');
  await asha.waitForSelector(".call-ring-card", { timeout: 20000 });
  await asha.click('[aria-label="Accept video call"]');
  await ravi.waitForSelector(".call-screen.premium", { timeout: 15000 });
  const bar = await ravi.waitForSelector(".cp-spell", { timeout: 60000 }).then(() => true).catch(() => false);
  check("Ravi (ASL) gets the fingerspelling bar with built-in ASL letters", bar, await ravi.locator(".cp-spell-head span").innerText().catch(() => ""));
  // Watch what the spelling bar shows and what Asha receives.
  const seen = new Set();
  let received = "";
  const end = Date.now() + 120000;
  while (Date.now() < end && !received) {
    const w = await ravi.locator(".cp-spell-word b").allInnerTexts().catch(() => []);
    if (w.length) seen.add(w.join(""));
    // The camera video loops, so the first word may be a partial one; wait for the full CAB.
    received = (await asha.locator(".tr-entry.peer .tr-text").allInnerTexts().catch(() => [])).find((t) => t.trim() === "CAB") ?? "";
    await ravi.waitForTimeout(150);
  }
  await ravi.screenshot({ path: "fs-reading-ravi.png" });
  check("Letters appear one by one on Ravi's spelling bar", [...seen].some((x) => x.length >= 2), [...seen].join(" → "));
  check("After the pause the spelled word is sent and Asha receives it", /CAB/.test(received), received || "nothing");
  await asha.screenshot({ path: "fs-reading-asha.png" });
} catch (err) {
  check("No step crashed", false, String(err.message).slice(0, 300));
}
await raviBrowser.close();
await ashaBrowser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
