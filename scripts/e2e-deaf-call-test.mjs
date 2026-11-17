// Two Deaf people on a real video call (Asha signs ISL, Ravi signs ASL in this test): Deaf <-> Deaf mode is chosen
// automatically on both sides, videos are side by side, speech captions are off, and typed words are fingerspelled
// in each person's own sign language. Mode changes and medical mode are shared. Also: "Clear chat (only for me)".
// Usage: node e2e-deaf-call-test.mjs <web-url>   (Ravi's sign language must be ASL in that server's data)
import { chromium } from "playwright-core";

const WEB = process.argv[2] ?? "http://localhost:5173";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
async function signIn(phone, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForSelector(".main-app-layout-shell", { state: "attached", timeout: 15000 });
  await page.waitForSelector(".brand-splash", { state: "detached", timeout: 8000 }).catch(() => {});
  return page;
}
const lettersShown = async (page, selector, ms) =>
  page.evaluate(async ({ selector, ms }) => {
    const seen = [];
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = (document.querySelector(`${selector} .fs-photo`)?.getAttribute("src") ?? "").match(/\/signs\/(\w+)\/(\w)\.jpg$/);
      const k = m ? `${m[1]}:${m[2]}` : null;
      if (k && seen[seen.length - 1] !== k) seen.push(k);
      await new Promise((r) => setTimeout(r, 60));
    }
    return seen;
  }, { selector, ms });

try {
  const ravi = await signIn("9111100002", "ravi");
  const asha = await signIn("9111100001", "asha");

  // ---- Clear chat (only for me) ----
  await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
  await asha.locator(".chat-summary-item", { hasText: "Ravi" }).first().click();
  await ravi.waitForTimeout(1200);
  const ashaBefore = await asha.locator(".message-bubble").count();
  await ravi.click(".menu-dropdown-wrapper > button");
  await ravi.locator("button", { hasText: "Clear chat (only for me)" }).click();
  await ravi.waitForTimeout(1200);
  const raviAfter = await ravi.locator(".message-bubble").count();
  await asha.reload({ waitUntil: "networkidle" });
  await asha.waitForSelector(".main-app-layout-shell", { state: "attached" });
  await asha.waitForSelector(".brand-splash", { state: "detached", timeout: 8000 }).catch(() => {});
  await asha.locator(".chat-summary-item", { hasText: "Ravi" }).first().click();
  await asha.waitForTimeout(1500);
  const ashaAfter = await asha.locator(".message-bubble").count();
  check("'Clear chat (only for me)' empties Ravi's chat", raviAfter === 0, `Ravi now sees ${raviAfter}`);
  check("...and Asha still has all her messages", ashaBefore > 0 && ashaAfter === ashaBefore, `Asha ${ashaBefore} -> ${ashaAfter}`);

  // ---- Deaf <-> Deaf video call ----
  await ravi.click('[aria-label="Video Call"]');
  await asha.waitForSelector(".call-ring-card", { timeout: 20000 });
  await asha.click('[aria-label="Accept video call"]');
  await asha.waitForSelector(".call-screen.premium", { timeout: 15000 });
  await ravi.waitForSelector(".call-screen.premium", { timeout: 15000 });
  await asha.waitForTimeout(2500);
  const modeOf = (p) => p.locator(".cp-mode-row button.on").first().innerText();
  check("Both signers get Deaf ↔ Deaf mode automatically", (await modeOf(asha)) === "Deaf ↔ Deaf" && (await modeOf(ravi)) === "Deaf ↔ Deaf");
  check("Videos are shown side by side (large) for both", (await asha.locator(".call-screen.mode-deaf-deaf").count()) === 1 && (await ravi.locator(".call-screen.mode-deaf-deaf").count()) === 1);
  check("Speech captions are off for both", (await asha.getAttribute('[aria-label="Speech captions"]', "aria-checked")) === "false" && (await ravi.getAttribute('[aria-label="Speech captions"]', "aria-checked")) === "false");
  await asha.screenshot({ path: "deaf-deaf-asha.png" });

  await ravi.fill(".cp-type input", "Hello");
  await ravi.click(".cp-type button");
  const ashaSaw = await lettersShown(asha, ".cp-sign-stage", 6000);
  check("Ravi's words reach Asha as ISL fingerspelling (her language)", ashaSaw.join("").includes("isl:H") && ashaSaw.some((k) => k === "isl:O"), ashaSaw.join(" "));
  await asha.fill(".cp-type input", "Hi");
  await asha.click(".cp-type button");
  const raviSaw = await lettersShown(ravi, ".cp-sign-stage", 5000);
  check("Asha's words reach Ravi as ASL fingerspelling (his language)", raviSaw.includes("asl:H") && raviSaw.includes("asl:I"), raviSaw.join(" "));

  // ---- Mode change is shared ----
  await ravi.click('.cp-mode-row button:has-text("Deaf ↔ Hearing")');
  const notice = await asha.waitForSelector(".call-mode-notice", { timeout: 6000 }).then((e) => e.innerText()).catch(() => "");
  check("When Ravi switches mode, Asha's call switches too and she is told", /switched to Deaf ↔ Hearing/.test(notice) && (await modeOf(asha)) === "Deaf ↔ Hearing", notice);

  // ---- Medical mode ----
  await asha.click('[aria-label="Medical mode"]');
  await ravi.waitForSelector(".med-board", { timeout: 6000 });
  check("Medical mode turns on for both, with the safety note", (await ravi.locator(".med-safety").count()) === 1 && (await asha.locator(".med-board").count()) === 1);
  await ravi.click('.med-tabs button:has-text("Symptoms")');
  await ravi.click('.med-phrases button:has-text("I have a fever")');
  const got = await asha.waitForSelector('.tr-entry.peer:has-text("I have a fever")', { timeout: 8000 }).then(() => true).catch(() => false);
  check("A tapped medical phrase reaches the other person", got);
  await asha.click('.med-pain button:has-text("6")');
  const pain = await ravi.waitForSelector('.tr-entry.peer:has-text("My pain is 6 out of 10")', { timeout: 8000 }).then(() => true).catch(() => false);
  check("The pain scale sends 'My pain is 6 out of 10'", pain);
  await ravi.screenshot({ path: "medical-ravi.png" });
  await asha.click('[aria-label="End call"]');
} catch (err) {
  check("No step crashed", false, String(err.message).slice(0, 300));
}
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
