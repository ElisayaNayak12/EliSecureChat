// E2E: end-to-end encryption between two real browsers + a second device + a user without keys.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const [out] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function signIn(phone, password = "Test@1234") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", password);
  await page.click("button[type=submit]");
  await page.waitForSelector(".desktop-app-sidebar", { timeout: 15000 });
  await page.waitForTimeout(4000);
  return page;
}
async function openChat(page, name) {
  await page.locator(".chat-summary-item", { hasText: name }).first().click();
  await page.waitForTimeout(1500);
}
async function send(page, text) {
  await page.fill(".composer-input-field", text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}
const bubble = (page, text) => page.locator(".message-plain-text", { hasText: text });

const API = "http://localhost:3000";
const token = async (phone) => (await (await fetch(`${API}/auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json", connection: "close" }, body: JSON.stringify({ phone, password: "Test@1234", client: "native" }) })).json()).accessToken;
try {
  const asha = await signIn("9111100001");
  const ravi = await signIn("9111100002");
  await openChat(asha, "Ravi");
  await openChat(ravi, "Asha");
  const before = `Before revoke ${Date.now()}`;
  await send(ravi, before);
  await asha.waitForTimeout(2500);
  check("Asha's device reads the message", (await bubble(asha, before).count()) === 1);
  const oldId = await asha.evaluate(() => window.__e2ee?.me?.keys?.deviceId);
  const t = await token("9111100001");
  const del = await fetch(`${API}/keys/devices/${oldId}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}`, connection: "close" } });
  check("Device revoked through the API", del.ok, String(del.status));
  await asha.reload({ waitUntil: "networkidle" });
  await asha.waitForTimeout(5000);
  await openChat(asha, "Ravi");
  await asha.waitForTimeout(2000);
  const newId = await asha.evaluate(() => window.__e2ee?.me?.keys?.deviceId);
  const ready = await asha.evaluate(() => window.__e2ee?.ready);
  check("After reload the browser re-keys itself instead of breaking", ready === true && newId && newId !== oldId, `${oldId?.slice(0, 8)} -> ${newId?.slice(0, 8)}`);
  check("History sealed to the old keys is still readable on this browser", (await bubble(asha, before).count()) === 1);
  const fromAsha = `From re-keyed device ${Date.now()}`;
  await send(asha, fromAsha);
  await ravi.waitForTimeout(3000);
  check("Ravi reads messages from the re-keyed device", (await bubble(ravi, fromAsha).count()) === 1);
  await ravi.reload({ waitUntil: "networkidle" });
  await ravi.waitForTimeout(4500);
  await openChat(ravi, "Asha");
  const toAsha = `To re-keyed device ${Date.now()}`;
  await send(ravi, toAsha);
  await asha.waitForTimeout(3000);
  check("The re-keyed device receives new messages", (await bubble(asha, toAsha).count()) === 1);
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
