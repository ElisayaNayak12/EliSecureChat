import { chromium } from "playwright-core";
const out = process.argv[2];
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); };
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function signIn(phone, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForTimeout(4500);
  return page;
}
try {
  const ravi = await signIn("9111100002", "ravi");
  const asha = await signIn("9111100001", "asha");
  for (const p of [ravi, asha]) {
    await p.locator(".chat-summary-item").first().click();
    await p.waitForTimeout(1000);
  }
  await ravi.click('.btn-composer-action[title="Toggle Emojis"]');
  await ravi.waitForSelector(".expr-panel");
  check("Panel opens with emoji grouped by mood", (await ravi.locator(".expr-groups button").count()) >= 10);
  await ravi.click('.expr-groups button[aria-label="Love"]');
  await ravi.screenshot({ path: `${out}/panel-emoji.png` });
  await ravi.click('.expr-tabs button:has-text("Stickers")');
  check("Leafy stickers listed", (await ravi.locator(".expr-sticker-grid button").count()) >= 23, String(await ravi.locator(".expr-sticker-grid button").count()));
  await ravi.screenshot({ path: `${out}/panel-stickers.png` });
  await ravi.click('.expr-tabs button:has-text("GIFs")');
  await ravi.screenshot({ path: `${out}/panel-gifs.png` });
  await ravi.click('.expr-tabs button:has-text("Stickers")');
  await ravi.click('.expr-sticker-grid button[aria-label="Send Thank you sticker"]');
  const got = await asha.waitForSelector(".message-sticker svg[aria-label='Thank you sticker']", { timeout: 15000 }).then(() => true).catch(() => false);
  check("Asha receives the sticker (end-to-end encrypted text)", got);
  // smart suggestions
  await ravi.fill(".composer-input-field", "Happy birthday Asha!");
  const sug = await ravi.waitForSelector(".smart-suggest", { timeout: 4000 }).then(() => true).catch(() => false);
  check("Typing 'Happy birthday' shows suggestions", sug, await ravi.locator(".smart-suggest").innerText().catch(() => ""));
  await ravi.screenshot({ path: `${out}/suggest.png` });
  await ravi.click('.ss-gif[aria-label="Send Happy birthday GIF"]');
  check("Draft is kept after sending a suggestion", (await ravi.inputValue(".composer-input-field")) === "Happy birthday Asha!");
  const gif = await asha.waitForSelector(".message-gif .gif-card[aria-label='Happy birthday animation']", { timeout: 15000 }).then(() => true).catch(() => false);
  check("Asha receives the animated birthday GIF", gif);
  await asha.waitForTimeout(800);
  await asha.screenshot({ path: `${out}/asha-received.png` });
  const preview = await asha.locator(".chat-summary-preview").first().innerText();
  check("Chat list shows a readable label", /GIF|Sticker/.test(preview), preview);
} catch (e) { check("No crash", false, String(e.message).slice(0, 300)); }
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
