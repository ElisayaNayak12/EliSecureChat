import { chromium } from "playwright-core";
const out = process.argv[2];
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); };
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function signIn(phone, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  page.on("dialog", (d) => d.accept());
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
  await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
  await asha.locator(".chat-summary-item", { hasText: "Ravi" }).first().click();
  await ravi.waitForTimeout(800);

  // tone check
  await ravi.fill(".composer-input-field", "This is ridiculous, hurry up!!!");
  const tone = await ravi.waitForSelector(".tone-check", { timeout: 3000 }).then(() => true).catch(() => false);
  check("Tone check appears for a harsh message", tone, await ravi.locator(".tone-main span").innerText().catch(() => ""));
  await ravi.screenshot({ path: `${out}/tone.png` });
  await ravi.click('.tone-check button:has-text("Use kinder")');
  const kinder = await ravi.inputValue(".composer-input-field");
  check("'Use kinder' rewrites the draft", !/ridiculous|hurry up|!!!/i.test(kinder), kinder);
  check("Tone check hides for the kinder text", (await ravi.locator(".tone-check").count()) === 0);
  await ravi.fill(".composer-input-field", "");

  // time capsule
  await ravi.fill(".composer-input-field", "Open this on your birthday!");
  await ravi.click('[aria-label="Time capsule"]');
  await ravi.fill('[aria-label="Opening date"]', "2027-01-02");
  await ravi.screenshot({ path: `${out}/capsule-popover.png` });
  await ravi.click('.capsule-popover button:has-text("Seal and send")');
  const sealed = await asha.waitForSelector(".capsule-sealed", { timeout: 15000 }).then(() => true).catch(() => false);
  check("Asha gets a sealed time capsule", sealed, await asha.locator(".capsule-sealed").last().innerText().catch(() => ""));
  const leaked = await asha.locator(".chat-scroll-area", { hasText: "Open this on your birthday!" }).count();
  check("Asha cannot read the sealed text yet", leaked === 0);
  check("Ravi's draft is cleared after sealing", (await ravi.inputValue(".composer-input-field")) === "");
  await asha.waitForTimeout(600);
  await asha.screenshot({ path: `${out}/capsule-asha.png` });

  // vault
  await asha.click('.sidebar-nav-btn[title="Chats"]');
  await asha.click('[aria-label="Private Vault"]');
  await asha.fill('[aria-label="Vault PIN"]', "2468");
  await asha.fill('[aria-label="Confirm vault PIN"]', "2468");
  await asha.fill('[aria-label="Decoy PIN"]', "1111");
  await asha.click('.vault-form button[type=submit]');
  await asha.locator(".vault-list li", { hasText: "Ravi" }).locator("button", { hasText: "Hide in vault" }).click();
  await asha.screenshot({ path: `${out}/vault-open.png` });
  await asha.click(".vault-x");
  check("Hidden chat disappears from the chat list", (await asha.locator(".chat-summary-item", { hasText: "Ravi" }).count()) === 0);
  await asha.click('[aria-label="Private Vault"]');
  await asha.fill('[aria-label="Vault PIN"]', "1111");
  await asha.click('.vault-form button[type=submit]');
  check("Decoy PIN shows an empty vault", (await asha.locator(".vault-body", { hasText: "Your vault is empty" }).count()) === 1 && (await asha.locator(".vault-open").count()) === 0);
  await asha.click('.vault-actions button:has-text("Lock")');
  await asha.fill('[aria-label="Vault PIN"]', "0000");
  await asha.click('.vault-form button[type=submit]');
  check("Wrong PIN is refused", (await asha.locator(".vault-error").count()) === 1);
  await asha.fill('[aria-label="Vault PIN"]', "2468");
  await asha.click('.vault-form button[type=submit]');
  check("Real PIN shows the hidden chat", (await asha.locator(".vault-open", { hasText: "Ravi" }).count()) === 1);
  await asha.click('.vault-actions button:has-text("Remove vault")');
  await asha.click(".vault-x").catch(() => {});
  await asha.waitForTimeout(500);
  check("Removing the vault brings the chat back", (await asha.locator(".chat-summary-item", { hasText: "Ravi" }).count()) === 1);

  // accessibility profile
  await asha.click('.sidebar-nav-btn[title="Settings"]');
  await asha.click('.a11y-profile:has-text("Low vision")');
  await asha.waitForTimeout(800);
  const ds = await asha.evaluate(() => ({ ...document.documentElement.dataset }));
  check("Low vision profile applies extra-large text + high contrast", ds.textSize === "x-large" && ds.contrast === "high", JSON.stringify({ t: ds.textSize, c: ds.contrast }));
  await asha.screenshot({ path: `${out}/a11y.png` });
  await asha.click('.a11y-profile:has-text("Standard")');
  await asha.waitForTimeout(800);
  const ds2 = await asha.evaluate(() => ({ ...document.documentElement.dataset }));
  check("Standard profile restores defaults", ds2.textSize === "default" && ds2.contrast === "normal");
} catch (e) { check("No crash", false, String(e.message).slice(0, 300)); }
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
