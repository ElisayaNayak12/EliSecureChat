import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LOGO_CID, newSignInEmail, passwordChangedEmail, resetCodeEmail, verificationEmail, welcomeEmail } from "../src/notifications/templates";

test("every email carries the attached logo, the brand name and a plain-text version", () => {
  const all = [
    verificationEmail("Riya Sharma", "482913", 10),
    resetCodeEmail("Riya", "731406", 10),
    welcomeEmail("Riya Sharma", "https://chat.example.com"),
    passwordChangedEmail("Riya", new Date("2026-11-13T08:44:00Z"), "Chrome on Android", "https://chat.example.com"),
    newSignInEmail("Riya", new Date("2026-11-13T08:50:00Z"), "Chrome on Windows", "https://chat.example.com"),
  ];
  for (const e of all) {
    assert.ok(e.html.includes(`cid:${LOGO_CID}`), `${e.subject}: logo`);
    assert.match(e.html, /Eli<span[^>]*>Secure<\/span>Chat/);
    assert.ok(e.text.length > 40 && !e.text.includes("<"), `${e.subject}: plain text`);
  }
  assert.ok(existsSync(join(__dirname, "..", "assets", "email-logo.png")), "logo file ships with the backend");
});

test("codes are shown as separate digits with the expiry, and in the plain text", () => {
  const e = verificationEmail("Riya", "482913", 10);
  for (const d of "482913") assert.ok(e.html.includes(`>${d}</div>`));
  assert.match(e.html, /Expires in 10 minutes/);
  assert.match(e.text, /482913/);
  assert.equal(e.subject, "482913 is your EliSecureChat verification code");
});

test("security alerts use the red style, local time and a link that opens Forgot password", () => {
  const e = passwordChangedEmail("Riya", new Date("2026-11-13T08:44:00Z"), "Chrome on Android", "https://chat.example.com/");
  assert.match(e.html, /#8A2E2E/);
  assert.match(e.html, /https:\/\/chat\.example\.com\/#forgot/);
  assert.match(e.html, /13 Nov 2026, 2:14\s?pm IST/i, "shown in India time, not GMT");
  assert.match(e.text, /#forgot/);
});

test("names are escaped so an email cannot be broken by a user's name", () => {
  const e = welcomeEmail("<script>x</script>", "https://chat.example.com");
  assert.ok(!e.html.includes("<script>"));
});
