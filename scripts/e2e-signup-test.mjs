// Verified sign-up + forgot password in the real web UI. Codes are read from the dev outbox
// (apps/backend/data/outbox), exactly as a user would read them from their inbox / SMS.
import { chromium } from "playwright-core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUTBOX = "D:/EliChat/EliSecureChat/apps/backend/data/outbox";
const out = process.argv[2] ?? ".";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const since = Date.now();
function latest(toPart, subjectRe) {
  let files = [];
  try {
    files = readdirSync(OUTBOX).filter((f) => f.endsWith(".txt") && f.includes(toPart)).map((f) => join(OUTBOX, f));
  } catch {}
  files = files.filter((f) => statSync(f).mtimeMs >= since - 1000).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    if (!subjectRe || subjectRe.test(t)) return { file: f, text: t, code: t.match(/\b\d{6}\b/)?.[0] };
  }
  return null;
}
async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

const rnd = String(Math.floor(10000 + Math.random() * 89999));
const NATIONAL = `98765 ${rnd}`;
const E164 = `+9198765${rnd}`;
const EMAIL = `riya.e2e.${rnd}@gmail.com`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
try {
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.click(".auth-tabs button:has-text('Create Account')");
  await page.fill("#name-input", "Riya Sharma");

  // Validation: bad phone and an email typo are explained before anything is sent.
  await page.fill("#signup-phone", "12345");
  await page.fill("#email-input", "riya@gmial.com");
  await page.locator("#signup-phone").blur();
  check("Invalid phone number is flagged as you type", /not valid/i.test(await page.locator(".phone-field + .field-error").innerText().catch(() => "")));
  await page.fill("#signup-phone", NATIONAL);
  await page.locator("#signup-phone").blur();
  check("Valid Indian mobile number is accepted and formatted", (await page.locator(".phone-field.is-valid").count()) === 1, await page.inputValue("#signup-phone"));
  await page.fill("#pwd-input", "password123");
  check("Password strength meter and rules are shown", (await page.locator(".pw-rules li").count()) === 3);
  await page.fill("#pwd-input", "Green-Forest-42");
  await page.fill("#pwd2-input", "Green-Forest-42");
  await page.click("button[type=submit]");
  await page.waitForTimeout(1500);
  check("Email typo is caught by the server with a suggestion", /gmail\.com/i.test(await page.locator(".field-error").allInnerTexts().then((t) => t.join(" "))));
  await page.fill("#email-input", EMAIL);
  await page.screenshot({ path: `${out}/signup-form.png`, fullPage: true });
  await page.click("button[type=submit]");
  await page.waitForSelector("#email-code-0", { timeout: 10000 });
  check("Verification screen asks only for the email code (SMS is off)", (await page.locator("#sms-code-0").count()) === 0, (await page.locator(".auth-verify-lead").innerText()).replace(/\s+/g, " "));

  const mail = await waitFor(() => latest(EMAIL, /verification code/));
  check("Verification email was sent (with the code)", !!mail?.code, mail ? mail.file.split(/[\\/]/).pop() : "none");
  check("No SMS is sent", !latest(E164));
  await page.screenshot({ path: `${out}/signup-verify.png`, fullPage: true });

  // Wrong code first.
  await page.fill("#email-code-0", mail.code === "000000" ? "111111" : "000000");
  await page.click("button[type=submit]");
  await page.waitForTimeout(1200);
  check("A wrong code is rejected with a clear message", /not correct/i.test(await page.locator(".field-error").allInnerTexts().then((t) => t.join(" "))));
  for (let i = 5; i >= 0; i--) await page.fill(`#email-code-${i}`, "");
  await page.fill("#email-code-0", mail.code);
  await page.click("button[type=submit]");
  const inApp = await page.waitForSelector(".desktop-app-sidebar", { timeout: 15000 }).then(() => true).catch(() => false);
  check("Correct codes create the account and sign in", inApp);
  const welcome = await waitFor(() => latest(EMAIL, /Welcome to EliSecureChat/));
  check("Welcome email sent", !!welcome);

  // Sign out, then forgot password by email.
  await page.evaluate(async () => {
    const r = await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    return r.status;
  });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.waitForSelector("#phone-input", { timeout: 10000 });
  await page.click("text=Forgot password?");
  check("Forgot password offers email only (no SMS choice)", (await page.locator(".reset-channels").count()) === 0);
  await page.fill("#reset-email", EMAIL);
  await page.click("button[type=submit]");
  await page.waitForSelector("#reset-code-0", { timeout: 8000 });
  const reset = await waitFor(() => latest(EMAIL, /password reset code/));
  check("Password reset email with a code", !!reset?.code);
  await page.fill("#reset-code-0", reset.code);
  await page.fill("#pwd-input", "Blue-River-77");
  await page.fill("#pwd2-input", "Blue-River-77");
  await page.screenshot({ path: `${out}/reset-confirm.png`, fullPage: true });
  await page.click("button[type=submit]");
  await page.waitForTimeout(1500);
  check("Password changed message shown", /Password changed/i.test(await page.locator(".auth-status-banner").allInnerTexts().then((t) => t.join(" "))));
  check("Password-changed email sent", !!(await waitFor(() => latest(EMAIL, /password was changed/))));

  // Sign in with the email and the new password.
  await page.fill("#phone-input", EMAIL);
  await page.fill("#pwd-input", "Blue-River-77");
  await page.click("button[type=submit]");
  check("Sign in with email + new password works", await page.waitForSelector(".desktop-app-sidebar", { timeout: 15000 }).then(() => true).catch(() => false));
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
  await page.screenshot({ path: `${out}/signup-crash.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed  (test account ${E164} / ${EMAIL})`);
process.exit(results.every(Boolean) ? 0 : 1);
