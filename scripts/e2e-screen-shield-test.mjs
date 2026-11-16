// Screenshot protection on the web: watermark, cover on Windows/Command key, Print Screen wipes the clipboard,
// printing shows nothing, switching away hides content, and normal use is not blocked.
// Usage: node e2e-screen-shield-test.mjs <web-url>
import { chromium } from "playwright-core";

const WEB = process.argv[2] ?? "http://localhost:5173";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("dialog", (d) => d.accept());
const covered = () => page.locator(".screen-shield-cover").count().then((n) => n === 1);
try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", "9111100002");
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForSelector(".main-app-layout-shell", { state: "attached", timeout: 15000 });
  await page.waitForSelector(".brand-splash", { state: "detached", timeout: 8000 }).catch(() => {});

  const wm = await page.locator(".screen-watermark span").first().innerText();
  check("A faint watermark with the viewer's name and number covers the app", /Ravi/.test(wm) && /9111100002/.test(wm), wm);
  check("Normal use is not blocked (no cover while using the app)", !(await covered()));
  await page.click('.sidebar-nav-btn[title="Contacts"]');
  check("Clicks still work through the watermark", (await page.locator(".contacts-find").count()) === 1);

  await page.keyboard.down("Meta");
  check("Pressing the Windows/Command key covers the screen at once (before a snipping tool can capture)", await covered());
  await page.keyboard.up("Meta");
  await page.waitForTimeout(1300);
  check("...and the cover goes away after the key is released", !(await covered()));

  await page.evaluate(() => navigator.clipboard.writeText("secret message text"));
  await page.keyboard.press("PrintScreen");
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("Print Screen wipes the clipboard (the copied screenshot is gone)", clip.trim() === "", JSON.stringify(clip));
  check("Print Screen covers the screen", await covered());
  await page.waitForTimeout(1800);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  check("Switching to another window (e.g. a snipping tool) hides the content", await covered());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(800);
  check("Coming back shows the app again", !(await covered()));

  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "shield-print.png" });
  const printHidden = await page.evaluate(() => getComputedStyle(document.querySelector(".main-app-layout-shell") ?? document.body).visibility);
  check("Printing / Save as PDF shows nothing of the chats", printHidden === "hidden", printHidden);
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({ path: "shield-normal.png" });
} catch (err) {
  check("No step crashed", false, String(err.message).slice(0, 250));
}
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
