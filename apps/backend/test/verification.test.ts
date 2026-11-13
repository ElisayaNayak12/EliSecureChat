// Verified sign-up (email + SMS codes), sign-in by phone or email, new-device alerts, password policy and reset by
// email or SMS. Messages go to the dev outbox, which the tests read.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { bootApp, call, type TestApp } from "./helpers";
import { checkEmail, checkPhone, passwordProblem } from "../src/auth/contact";

let t: TestApp;
before(async () => {
  t = await bootApp("verify");
});
after(async () => {
  await t.close();
});

const PHONE = "+91 98765 43210";
const E164 = "+919876543210";
const EMAIL = "riya.sharma@gmail.com";

test("phone numbers must be real mobile numbers", () => {
  assert.equal(checkPhone("98765 43210").ok, true, "national format with the default country (IN)");
  const intl = checkPhone("+1 415 555 2671");
  assert.equal(intl.ok, true);
  assert.equal(checkPhone("12345").ok, false);
  assert.equal(checkPhone("+91 12345 67890").ok, false, "Indian mobiles start with 6-9");
  const landline = checkPhone("+91 11 2345 6789");
  assert.equal(landline.ok, false);
  assert.match((landline as { reason: string }).reason, /mobile|valid/i);
});

test("email addresses are checked for typos, throwaway domains and a mail-capable domain", async () => {
  const prev = process.env.EMAIL_MX_CHECK;
  process.env.EMAIL_MX_CHECK = "on";
  try {
    const typo = await checkEmail("riya@gmial.com");
    assert.equal(typo.ok, false);
    assert.match((typo as { reason: string }).reason, /riya@gmail\.com/, "suggests the likely address");
    assert.equal((await checkEmail("x@mailinator.com")).ok, false);
    assert.equal((await checkEmail("not-an-email")).ok, false);
    const nx = await checkEmail("a@no-such-domain-xyz.com", async () => {
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    });
    assert.equal(nx.ok, false);
    assert.equal((await checkEmail("a@empty.com", async () => [])).ok, false);
    assert.equal((await checkEmail("a@good.com", async () => [{ exchange: "mx.good.com", priority: 1 }])).ok, true);
    const offline = await checkEmail("a@somewhere.com", async () => {
      throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });
    });
    assert.equal(offline.ok, true, "a DNS outage does not block sign-up; the emailed code still proves ownership");
  } finally {
    process.env.EMAIL_MX_CHECK = prev;
  }
});

test("password rules", () => {
  assert.match(passwordProblem("short1")!, /8 characters/);
  assert.match(passwordProblem("onlyletters")!, /letters and numbers/);
  assert.match(passwordProblem("password123")!, /common/);
  assert.match(passwordProblem("riya12345", { name: "Riya Sharma" })!, /name/);
  assert.match(passwordProblem("x543210ab", { phone: E164 })!, /phone/);
  assert.equal(passwordProblem("Green-Forest-42", { name: "Riya Sharma", phone: E164, email: EMAIL }), null);
});

test("sign-up validates every field before sending any code", async () => {
  const base = { name: "Riya Sharma", phone: PHONE, email: EMAIL, password: "Green-Forest-42" };
  const bad = async (patch: object, field: string) => {
    const r = await call(t.base, "POST", "/auth/sign-up/start", { body: { ...base, ...patch } });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.field, field);
  };
  await bad({ phone: "12345" }, "phone");
  await bad({ email: "riya@gmial.com" }, "email");
  await bad({ password: "password123" }, "password");
  await bad({ name: "R" }, "name");
  assert.equal(t.notify.sent.length, 0, "nothing was sent for invalid input");
});

test("full sign-up (email only while no SMS provider is set up): code, account created only after verification, welcome email", async () => {
  const opts = await call(t.base, "GET", "/auth/options");
  assert.equal(opts.status, 200);
  assert.equal(opts.body.verification.email, true);

  const start = await call(t.base, "POST", "/auth/sign-up/start", { body: { name: "Riya Sharma", phone: PHONE, email: EMAIL, password: "Green-Forest-42" } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.channels.email, true);
  assert.equal(start.body.channels.sms, false, "SMS is off until a provider is configured");
  assert.match(start.body.email, /^ri•+@gmail\.com$/);
  assert.equal(t.store.findUserByEmail(EMAIL), undefined, "no account before verification");

  const emailCode = t.lastCode(EMAIL)!;
  assert.match(emailCode, /^\d{6}$/);
  assert.equal(t.lastCode(E164), undefined, "no SMS was sent");
  const verifyEmail = t.notify.sent.find((m) => m.to === EMAIL)!;
  assert.match(verifyEmail.subject!, /verification code/);
  assert.match(verifyEmail.html!, new RegExp(emailCode));

  const resendTooSoon = await call(t.base, "POST", "/auth/sign-up/resend", { body: { registrationId: start.body.registrationId, channel: "email" } });
  assert.equal(resendTooSoon.status, 429, "resend has a cooldown");

  const wrong = await call(t.base, "POST", "/auth/sign-up/verify", { body: { registrationId: start.body.registrationId, emailCode: emailCode === "000000" ? "111111" : "000000" } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.field, "email");

  const ok = await call(t.base, "POST", "/auth/sign-up/verify", { body: { registrationId: start.body.registrationId, emailCode, client: "native" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.accessToken && ok.body.refreshToken);
  const user = t.store.findUserByEmail(EMAIL)!;
  assert.equal(user.phone, E164, "stored in international format");
  assert.equal(user.emailVerified, true);
  assert.equal(user.phoneVerified, false, "the number is validated as a real mobile, but not proven by SMS yet");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(t.notify.sent.some((m) => m.to === EMAIL && /Welcome/.test(m.subject ?? "")), "welcome email");


  const again = await call(t.base, "POST", "/auth/sign-up/start", { body: { name: "Riya Sharma", phone: "9876543210", email: "other@gmail.com", password: "Green-Forest-42" } });
  assert.equal(again.status, 409, "same phone in another format is detected");
  const reuse = await call(t.base, "POST", "/auth/sign-up/verify", { body: { registrationId: start.body.registrationId, emailCode } });
  assert.equal(reuse.status, 410, "a completed sign-up cannot be replayed");
});

test("sign in with phone (any format) or email; a new device triggers a security email", async () => {
  const before = t.notify.sent.length;
  const ua = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130.0" };
  for (const id of ["9876543210", "+91 98765-43210", "RIYA.SHARMA@gmail.com"]) {
    const r = await call(t.base, "POST", "/auth/sign-in", { body: { phone: id, password: "Green-Forest-42" }, headers: ua });
    assert.equal(r.status, 200, `${id}: ${JSON.stringify(r.body)}`);
  }
  await new Promise((r) => setTimeout(r, 50));
  const alerts = t.notify.sent.slice(before).filter((m) => /New sign-in/.test(m.subject ?? ""));
  assert.equal(alerts.length, 1, "only the first sign-in from a new device sends an alert");
  assert.match(alerts[0].text, /Chrome on Android/);
});

test("forgot password by email: code, strong new password, all devices signed out, confirmation email", async () => {
  const signIn = await call(t.base, "POST", "/auth/sign-in", { body: { phone: EMAIL, password: "Green-Forest-42" } });
  const req = await call(t.base, "POST", "/auth/password-reset/request", { body: { identifier: EMAIL, channel: "email" } });
  assert.equal(req.status, 200);
  const unknown = await call(t.base, "POST", "/auth/password-reset/request", { body: { identifier: "nobody@gmail.com", channel: "email" } });
  assert.deepEqual(unknown.body, req.body, "unknown accounts get the same answer");
  const code = t.lastCode(EMAIL)!;
  const resetMail = [...t.notify.sent].reverse().find((m) => m.to === EMAIL)!;
  assert.match(resetMail.subject!, /password reset code/);

  const weak = await call(t.base, "POST", "/auth/password-reset/confirm", { body: { identifier: EMAIL, code, newPassword: "riya123456" } });
  assert.equal(weak.status, 400, "the new password must follow the rules");
  const ok = await call(t.base, "POST", "/auth/password-reset/confirm", { body: { identifier: EMAIL, code, newPassword: "Blue-River-77" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await call(t.base, "GET", "/auth/sessions", { token: signIn.body.accessToken })).status, 401, "old sessions are revoked");
  assert.equal((await call(t.base, "POST", "/auth/sign-in", { body: { phone: PHONE, password: "Blue-River-77" } })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(t.notify.sent.some((m) => m.to === EMAIL && /password was changed/.test(m.subject ?? "")), "confirmation email");
  assert.equal((await call(t.base, "POST", "/auth/password-reset/confirm", { body: { identifier: EMAIL, code, newPassword: "Another-Pass-9" } })).status, 400, "codes are single-use");
});

test("SMS stays off without a provider: reset by SMS is refused and not offered", async () => {
  const opts = await call(t.base, "GET", "/auth/options");
  assert.equal(opts.body.resetChannels.sms, false);
  const req = await call(t.base, "POST", "/auth/password-reset/request", { body: { identifier: "9876543210", channel: "sms" } });
  assert.equal(req.status, 503);
});

test("ready for later: with an SMS provider (simulated), sign-up also needs the SMS code and reset works by SMS", async () => {
  process.env.SMS_DEV_OUTBOX = "on"; // stands in for Twilio
  try {
    const phone = "+91 91234 56781";
    const e164 = "+919123456781";
    const mail = "arjun.mehta@gmail.com";
    const start = await call(t.base, "POST", "/auth/sign-up/start", { body: { name: "Arjun Mehta", phone, email: mail, password: "Silver-Moon-58" } });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.equal(start.body.channels.sms, true);
    const emailCode = t.lastCode(mail)!;
    const smsCode = t.lastCode(e164)!;
    const missing = await call(t.base, "POST", "/auth/sign-up/verify", { body: { registrationId: start.body.registrationId, emailCode } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.field, "sms");
    const ok = await call(t.base, "POST", "/auth/sign-up/verify", { body: { registrationId: start.body.registrationId, emailCode, smsCode } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(t.store.findUserByEmail(mail)!.phoneVerified, true);
    const req = await call(t.base, "POST", "/auth/password-reset/request", { body: { identifier: "9123456781", channel: "sms" } });
    assert.equal(req.status, 200);
    await new Promise((r) => setTimeout(r, 30));
    const code = t.lastCode(e164)!;
    const reset = await call(t.base, "POST", "/auth/password-reset/confirm", { body: { identifier: e164, code, newPassword: "Night-Sky-2026" } });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
  } finally {
    delete process.env.SMS_DEV_OUTBOX;
  }
});

test("production: unverified sign-up is disabled, and sign-up needs a configured email server", async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const direct = await call(t.base, "POST", "/auth/sign-up", { body: { name: "Mallory", phone: "9123456780", password: "Mallory-pass-1" } });
    assert.equal(direct.status, 403);
    const start = await call(t.base, "POST", "/auth/sign-up/start", { body: { name: "Mallory Jones", phone: "+91 91234 56780", email: "mallory@gmail.com", password: "Purple-Cat-31" } });
    assert.equal(start.status, 503, "without SMTP the server says sign-up is unavailable instead of pretending");
    const opts = await call(t.base, "GET", "/auth/options");
    assert.equal(opts.body.verification.email, false);
    assert.equal(opts.body.verification.sms, false);
  } finally {
    process.env.NODE_ENV = prev;
  }
});
