// E2E for the new authentication: empty login form, stay signed in on reload, device list + remote sign-out,
// authenticated messaging + private media, sign-out, and password reset by one-time code.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const [out, serverLog] = process.argv.slice(2);
const API = "http://localhost:3000";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function open(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  return { ctx, page };
}
async function signIn(page, phone, password) {
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", password);
  await page.click("button[type=submit]");
  await page.waitForSelector(".desktop-app-sidebar", { timeout: 15000 });
  await page.waitForTimeout(3500); // splash
}
const onLoginPage = (page) => page.locator("#phone-input").count().then((n) => n > 0);

try {
  // 1. no pre-filled credentials
  const a = await open();
  await a.page.waitForSelector("#phone-input", { timeout: 15000 });
  const prefill = await a.page.evaluate(() => [document.querySelector("#phone-input").value, document.querySelector("#pwd-input").value]);
  check("Login form has no pre-filled credentials", prefill.every((v) => v === ""), JSON.stringify(prefill));

  // 2. sign in, reload, still signed in; token never in localStorage
  await signIn(a.page, "9111100001", "Test@1234");
  await a.page.reload({ waitUntil: "networkidle" });
  await a.page.waitForTimeout(4500);
  check("Stays signed in after a page reload (httpOnly refresh cookie)", !(await onLoginPage(a.page)) && (await a.page.locator(".desktop-app-sidebar").count()) === 1);
  const stored = await a.page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
  check("No tokens readable by page scripts (localStorage / document.cookie)", !/eyJ|sc_refresh|accessToken/.test(stored));

  // 3. devices list + remote sign-out of a second device
  const b = await open();
  await signIn(b.page, "9111100001", "Test@1234");
  await a.page.locator(".sidebar-nav-btn", { hasText: "Settings" }).click();
  await a.page.waitForSelector(".sec-session", { timeout: 10000 });
  await a.page.waitForTimeout(800);
  const devices = await a.page.locator(".sec-session").allInnerTexts();
  check("Settings lists signed-in devices, marking this one", devices.length >= 2 && devices.some((d) => /this device/.test(d)), `${devices.length} devices`);
  await a.page.screenshot({ path: `${out}/a1-devices.png` });
  await a.page.locator(".sec-session", { hasNotText: "this device" }).first().locator("button", { hasText: "Sign out" }).click();
  await a.page.waitForTimeout(800);
  await b.page.reload({ waitUntil: "networkidle" });
  await b.page.waitForTimeout(4000);
  check("A device signed out remotely is sent back to the login screen", await onLoginPage(b.page));

  // 4. authenticated messaging + private media through the UI
  await a.page.locator(".sidebar-nav-btn", { hasText: "Chats" }).click();
  await a.page.locator(".chat-summary-item", { hasText: "Ravi" }).first().click();
  await a.page.waitForTimeout(800);
  const text = `auth e2e ${Date.now()}`;
  await a.page.fill(".composer-input-field", text);
  await a.page.keyboard.press("Enter");
  await a.page.waitForTimeout(1500);
  check("Sending a message works with the new auth", (await a.page.locator(".message-plain-text", { hasText: text }).count()) === 1);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await a.page.setInputFiles('input[type="file"]', { name: "dot.png", mimeType: "image/png", buffer: png });
  await a.page.waitForTimeout(500);
  await a.page.locator(".btn-composer-send").click();
  await a.page.waitForTimeout(2500);
  const img = await a.page.evaluate(() => {
    const el = [...document.querySelectorAll(".attachment-img-render")].pop();
    return el ? { src: el.getAttribute("src"), ok: el.complete && el.naturalWidth > 0 } : null;
  });
  check("Image attachment uploads and displays (short-lived media token)", !!img?.ok && /access_token=/.test(img.src), img ? img.src.replace(/access_token=[^&]+/, "access_token=…") : "no image");
  if (img?.src) {
    const raw = img.src.replace(/[?&]access_token=[^&]+/, "");
    const anon = await fetch(raw.startsWith("http") ? raw : `http://localhost:5173${raw}`);
    check("The same file URL without a token is refused", anon.status === 401, `HTTP ${anon.status}`);
  }

  // 5. sign out
  await a.page.locator(".sidebar-nav-btn", { hasText: "Sign out" }).click();
  await a.page.waitForTimeout(1500);
  await a.page.reload({ waitUntil: "networkidle" });
  await a.page.waitForTimeout(3000);
  check("Sign out ends the session (reload shows login)", await onLoginPage(a.page));

  // 6. password reset by an emailed one-time code (dev outbox: apps/backend/data/outbox stands in for Gmail).
  //    The test account gets a test email address first.
  const ravi = await (await fetch(`${API}/auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9111100002", password: "Test@1234", client: "native" }) })).json();
  await fetch(`${API}/users/${ravi.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ravi.accessToken}` }, body: JSON.stringify({ email: "ravi.test@example.com" }) });
  const resetStarted = Date.now();
  await a.page.click("text=Forgot password?");
  await a.page.fill("#reset-email", "ravi.test@example.com");
  await a.page.click("button[type=submit]");
  await a.page.waitForSelector("#reset-code-0", { timeout: 10000 });
  await a.page.waitForTimeout(800);
  const outbox = "D:/EliChat/EliSecureChat/apps/backend/data/outbox";
  const { readdirSync, statSync } = await import("node:fs");
  const mailFiles = readdirSync(outbox).filter((f) => f.includes("email-ravi.test@example.com") && f.endsWith(".txt")).map((f) => `${outbox}/${f}`).filter((f) => statSync(f).mtimeMs >= resetStarted - 1000);
  const code = mailFiles.length ? readFileSync(mailFiles.sort().pop(), "utf8").match(/\b\d{6}\b/)?.[0] : undefined;
  check("Reset code is emailed (dev outbox) and the form asks for it", !!code);
  await a.page.fill("#reset-code-0", code ?? "000000");
  await a.page.fill("#pwd-input", "Temp@56789");
  await a.page.fill("#pwd2-input", "Temp@56789");
  await a.page.click("button[type=submit]");
  await a.page.waitForTimeout(1500);
  const notice = await a.page.locator(".auth-status-banner").last().innerText().catch(() => "");
  check("New password is set with the code", /Password changed/.test(notice), notice);
  const oldPw = await fetch(`${API}/auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9111100002", password: "Test@1234" }) });
  const newPw = await fetch(`${API}/auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9111100002", password: "Temp@56789" }) });
  check("Old password stops working, new one works", oldPw.status === 401 && newPw.status === 200);
  // restore Ravi's test password
  const tok = (await newPw.json()).accessToken;
  await fetch(`${API}/auth/change-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }, body: JSON.stringify({ currentPassword: "Temp@56789", newPassword: "Test@1234" }) });
  await a.page.screenshot({ path: `${out}/a2-login.png` });
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
