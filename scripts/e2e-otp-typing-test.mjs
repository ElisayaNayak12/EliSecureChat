// Types the 6-digit email code the way a person does (one key at a time, a mistake, Backspace, retype), on a
// phone-sized screen with touch and on desktop, then verifies the account is created.
// Usage: node e2e-otp-typing-test.mjs <web-url> <outbox-dir>
import { chromium } from "playwright-core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [WEB = "http://localhost:5173", OUTBOX = "apps/backend/data/outbox"] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};
const codeFor = async (email) => {
  for (let i = 0; i < 40; i++) {
    try {
      const f = readdirSync(OUTBOX).filter((n) => n.endsWith(".txt") && n.includes(email)).map((n) => join(OUTBOX, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      const m = f && readFileSync(f, "utf8").match(/verification code is: (\d{6})/);
      if (m) return m[1];
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
};

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const device of ["phone", "desktop"]) {
  const ctx = await browser.newContext(device === "phone" ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${device}:`, e.message));
  const rnd = String(Math.floor(10000 + Math.random() * 89999));
  const email = `otp.${device}.${rnd}@gmail.com`;
  try {
    await page.goto(WEB, { waitUntil: "networkidle" });
    await page.click(".auth-tabs button:has-text('Create Account')");
    await page.fill("#name-input", "Otp Tester");
    await page.fill("#signup-phone", `98764 ${rnd}`);
    await page.fill("#email-input", email);
    await page.fill("#pwd-input", "Green-Forest-42");
    await page.fill("#pwd2-input", "Green-Forest-42");
    await page.click("button[type=submit]");
    await page.waitForSelector("#email-code-0", { timeout: 10000 });
    const code = await codeFor(email);
    check(`${device}: verification code was sent`, !!code);

    // Tap the boxes (phone) / click (desktop), then type digit by digit with a typo in the middle.
    if (device === "phone") await page.tap(".otp-boxes");
    else await page.click(".otp-boxes");
    const wrong = code[3] === "9" ? "0" : "9";
    await page.keyboard.type(code.slice(0, 3), { delay: 120 });
    await page.keyboard.type(wrong, { delay: 120 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(code.slice(3), { delay: 120 });
    const shown = await page.$$eval(".otp-box", (els) => els.map((e) => e.textContent).join(""));
    check(`${device}: all six boxes fill in order while typing`, shown === code, `boxes "${shown}", code "${code}"`);
    // Extra key presses beyond 6 digits must not change the code.
    await page.keyboard.type("7", { delay: 80 });
    check(`${device}: a 7th digit is ignored`, (await page.inputValue("#email-code-0")) === code);
    await page.screenshot({ path: `otp-${device}.png` }).catch(() => {});
    await page.click("button[type=submit]");
    const inApp = await page.waitForSelector(".main-app-layout-shell", { state: "attached", timeout: 15000 }).then(() => true).catch(() => false);
    check(`${device}: Verify creates the account and signs in`, inApp);
  } catch (err) {
    check(`${device}: no step crashed`, false, String(err.message).slice(0, 200));
  }
  await ctx.close();
}
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
