// E2E: end-to-end encryption between two real browsers + a second device + a user without keys.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const [out, storeFile] = process.argv.slice(2);
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

try {
  const asha = await signIn("9111100001");
  const ravi = await signIn("9111100002");
  await openChat(asha, "Ravi");
  await openChat(ravi, "Asha");

  const secret = `E2EE secret ${Date.now()}`;
  await send(asha, secret);
  await ravi.waitForTimeout(2500);
  check("Ravi's browser decrypts Asha's message", (await bubble(ravi, secret).count()) === 1);

  const store = JSON.parse(readFileSync(storeFile, "utf8"));
  const stored = store.messages.filter((m) => m.encryptedContent.startsWith("e2e1:")).pop();
  const plainInStore = JSON.stringify(store.messages).includes(secret) || JSON.stringify(store.messages).includes(Buffer.from(secret).toString("base64"));
  check("The server stores only an encrypted envelope (no plaintext, no Base64)", !!stored && !plainInStore, stored ? `${stored.encryptedContent.slice(0, 60)}…` : "no envelope");
  const env = JSON.parse(stored.encryptedContent.slice(5));
  check("Envelope is sealed for each device and signed", Object.keys(env.keys).length >= 2 && env.sig.length > 40, `${Object.keys(env.keys).length} device keys`);

  const reply = `Reply ${Date.now()}`;
  await send(ravi, reply);
  await asha.waitForTimeout(2500);
  check("Asha's browser decrypts Ravi's reply", (await bubble(asha, reply).count()) === 1);

  // Safety codes
  const code = async (page) => {
    await page.locator(".header-profile-trigger").click();
    await page.waitForTimeout(800);
    await page.locator("button", { hasText: "Verify security code" }).click();
    await page.waitForTimeout(1200);
    return page.locator(".e2ee-code code").innerText();
  };
  const c1 = await code(asha);
  const c2 = await code(ravi);
  check("Both people see the same 60-digit security code", c1 === c2 && /^(\d{5} ){11}\d{5}$/.test(c1), c1);
  await asha.screenshot({ path: `${out}/e1-safety-code.png` });

  // Close the info panel on both (it replaces the message list while open).
  for (const p of [asha, ravi]) {
    if (await p.locator(".peer-info-grid").count()) await p.locator(".header-profile-trigger").click();
    await p.waitForTimeout(600);
  }
  // A brand-new device for Asha (new browser profile = new keys)
  const ashaNew = await signIn("9111100001");
  await openChat(ashaNew, "Ravi");
  await ashaNew.waitForTimeout(2000);
  const oldOnNew = await bubble(ashaNew, secret).count();
  const unreadable = await ashaNew.locator(".message-plain-text", { hasText: "sent before this device was set up" }).count();
  check("A new device cannot read history (keys never left the old device)", oldOnNew === 0 && unreadable > 0, `${unreadable} messages marked unreadable`);
  // Ravi's next message must reach BOTH of Asha's devices; Ravi is warned the code changed.
  await ravi.reload({ waitUntil: "networkidle" });
  await ravi.waitForTimeout(4500);
  await openChat(ravi, "Asha");
  const after = `After new device ${Date.now()}`;
  await send(ravi, after);
  await asha.waitForTimeout(2500);
  await ashaNew.waitForTimeout(500);
  await asha.screenshot({ path: `${out}/e2-old-device.png` });
  console.log("   old device header:", await asha.locator(".header-title").innerText().catch(() => "none"), "| peer profile open:", await asha.locator(".peer-info-grid").count());
  console.log("   old device has it:", await bubble(asha, after).count(), "| new device has it:", await bubble(ashaNew, after).count());
  console.log("   new device last bubbles:", JSON.stringify((await ashaNew.locator(".message-plain-text").allInnerTexts()).slice(-3)));
  console.log("   old device last bubbles:", JSON.stringify((await asha.locator(".message-plain-text").allInnerTexts()).slice(-3)));
  const st = JSON.parse(readFileSync(storeFile, "utf8"));
  const last = st.messages.filter((m) => m.encryptedContent.startsWith("e2e1:")).pop();
  console.log("   last envelope device slots:", Object.keys(JSON.parse(last.encryptedContent.slice(5)).keys).length);
  console.log("   new-device e2ee state:", JSON.stringify(await ashaNew.evaluate((c) => { const e = window.__e2ee; if (!e) return "no handle"; return { ready: e.ready, inflight: e.inflight.size, results: e.results.size, hasLast: e.results.has(c), lastView: e.view(c) }; }, last.encryptedContent)));
  console.log("   last envelope has slot for new device:", JSON.stringify(Object.keys(JSON.parse(last.encryptedContent.slice(5)).keys).slice(-3)), "new device id:", await ashaNew.evaluate(() => window.__e2ee?.me?.keys?.deviceId));
  for (const [nm, pg] of [["old", asha], ["new", ashaNew]]) console.log(`   ${nm} state:`, JSON.stringify(await pg.evaluate((c) => { const e = window.__e2ee; return { hasLast: e?.results.has(c), inflight: e?.inflight.size, pendingBubbles: [...document.querySelectorAll(".message-plain-text")].filter((x) => x.textContent.includes("Decrypting")).length, bubbles: document.querySelectorAll(".message-plain-text").length, loadEarlier: document.querySelector(".messages-load-earlier")?.textContent ?? null }; }, last.encryptedContent)));
  await asha.waitForTimeout(5000);
  console.log("   after +5s old has it:", await bubble(asha, after).count(), "new has it:", await bubble(ashaNew, after).count());
  check("New messages reach all of Asha's devices", (await bubble(asha, after).count()) === 1 && (await bubble(ashaNew, after).count()) === 1);

  // A user who never set up encryption: sending must be refused, never sent in plaintext.
  const one = await signIn("9000000001", "secret123");
  const two = (await one.locator(".chat-summary-item", { hasText: "User Two" }).count()) > 0;
  if (two) {
    await openChat(one, "User Two");
    const attempt = `should not send ${Date.now()}`;
    await one.fill(".composer-input-field", attempt);
    await one.keyboard.press("Enter");
    await one.waitForTimeout(2000);
    const status = await one.evaluate(() => document.body.innerText);
    const s2 = JSON.parse(readFileSync(storeFile, "utf8"));
    check("Messaging someone without encryption keys is refused (no plaintext fallback)", /hasn't set up end-to-end encryption/.test(status) && !JSON.stringify(s2.messages).includes(Buffer.from(attempt).toString("base64")));
  } else {
    console.log("   (skipped: User One has no chat with User Two)");
  }
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
