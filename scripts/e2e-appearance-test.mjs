import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.fill("#phone-input", "9111100002");
await page.fill("#pwd-input", "Test@1234");
await page.click("button[type=submit]");
await page.waitForTimeout(4000);
await page.click('.sidebar-nav-btn[title="Settings"]');
await page.waitForTimeout(800);
await page.locator(".appearance-section").scrollIntoViewIfNeeded();
const results = [];
for (const d of ["Verdant Glass", "Indigo Calm", "Classic Emerald", "Ocean Breeze", "Midnight"]) {
  await page.click(`.design-card:has-text("${d}")`);
  await page.waitForTimeout(500);
  const design = await page.evaluate(() => document.documentElement.dataset.design);
  const canvas = await page.evaluate(() => getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--aura-canvas").trim());
  results.push(`${d}: html=${design} canvas=${canvas}`);
  await page.screenshot({ path: `${out}/settings-${design}.png` });
}
// light mode + accent + compact
await page.click('.seg button:has-text("Light")');
await page.click('.accent-dot[aria-label="Rose"]');
await page.click('.seg button:has-text("Compact")');
await page.click('.wallpaper-select-btn[aria-label="Aurora"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/settings-light-rose.png` });
// saved on server?
const saved = await page.evaluate(async () => {
  const me = JSON.parse(localStorage.getItem("appearance"));
  return me;
});
results.push("cache " + JSON.stringify(saved));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3500);
results.push("after reload html: " + JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset }))));
await page.click('.sidebar-nav-btn[title="Chats"]');
await page.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/chat-light-rose-aurora.png` });
console.log(results.join("\n"));
console.log("errors:", errs);
await browser.close();
