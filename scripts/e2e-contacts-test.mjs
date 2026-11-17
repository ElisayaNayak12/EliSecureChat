// Private contacts (WhatsApp-style) in the real web app: no list of all users; add someone by exact number;
// an unknown number offers an invite; a contacts file shows who is on the app.
// Usage: node e2e-contacts-test.mjs <web-url>
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WEB = process.argv[2] ?? "http://localhost:5173";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("dialog", (d) => d.accept());
try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", "9111100002");
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForSelector(".main-app-layout-shell", { state: "attached", timeout: 15000 });
  // (The "no list of all users" rule is proven at server level in apps/backend/test/contacts.test.ts.)
  await page.click('.sidebar-nav-btn[title="Contacts"]');
  await page.waitForSelector(".contacts-find");
  check("Contacts screen explains that only your contacts on the app appear", /Only people in your contacts/.test(await page.locator(".contacts-privacy").innerText()));

  // Remove Asha first if she is already a contact, so the test starts clean.
  const existing = page.locator(".contact-card-wrapper", { hasText: "Asha" });
  if (await existing.count()) await existing.locator(".contact-remove").click();
  await page.waitForTimeout(600);
  check("Asha is not listed before being added", (await page.locator(".contact-card-wrapper", { hasText: "Asha" }).count()) === 0);

  await page.click("button:has-text('Add by phone or email')");
  await page.fill('.contacts-add-form input', "+91 91111 00001");
  await page.click(".contacts-add-form button[type=submit]");
  await page.waitForSelector(".contact-card-wrapper:has-text('Asha')", { timeout: 8000 });
  check("Adding Asha by her exact number shows her in Contacts", true, await page.locator(".contacts-message").innerText().catch(() => ""));

  await page.click("button:has-text('Add by phone or email')");
  await page.fill('.contacts-add-form input', "98765 00999");
  await page.click(".contacts-add-form button[type=submit]");
  await page.waitForSelector(".contacts-message.invite", { timeout: 8000 });
  check("An unknown number says 'isn't on EliSecureChat yet' and offers Invite", (await page.locator(".contacts-message.invite button:has-text('Invite')").count()) === 1);
  await page.screenshot({ path: "contacts-add.png" });

  const vcf = join(tmpdir(), "contacts-e2e.vcf");
  writeFileSync(vcf, "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Asha\r\nTEL:9111100001\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Friend\r\nTEL:+91 98765 00998\r\nEND:VCARD\r\n");
  await page.setInputFiles('.contacts-find input[type=file]', vcf);
  await page.waitForSelector(".contacts-result", { timeout: 8000 });
  const res = await page.locator(".contacts-result").innerText();
  check("Importing a contacts file shows who is on the app and who to invite", /1 of your contacts is on EliSecureChat/.test(res) && /1 isn't on it yet/.test(res), res.replace(/\s+/g, " "));
  await page.screenshot({ path: "contacts-import.png" });
} catch (err) {
  check("No step crashed", false, String(err.message).slice(0, 250));
}
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
