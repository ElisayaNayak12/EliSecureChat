// E2E: voice messages (fake mic plays a spoken WAV) and blocking.
import { chromium } from "playwright-core";

const [out, wav] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
});
async function signIn(phone) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone", "camera"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("dialog", (d) => { console.log("DIALOG:", d.message()); void d.accept(); });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForSelector(".desktop-app-sidebar", { timeout: 15000 });
  await page.waitForTimeout(4000);
  return page;
}
async function openChat(page, name) {
  await page.locator(".chat-summary-item", { hasText: name }).first().click();
  await page.waitForTimeout(1500);
}

try {
  const asha = await signIn("9111100001");
  const ravi = await signIn("9111100002");
  await openChat(asha, "Ravi");
  await openChat(ravi, "Asha");

  // ---- voice message ----
  const before = await ravi.locator("audio.attachment-audio").count();
  await asha.click('[aria-label="Record voice message"]');
  await asha.waitForTimeout(2500);
  check("Recording shows a live timer", /0:0[1-3]/.test(await asha.locator(".voice-time").innerText()));
  await asha.click('[aria-label="Send voice message"]');
  await ravi.waitForTimeout(4000);
  const audios = await ravi.locator("audio.attachment-audio").count();
  const meta = await ravi.evaluate(async () => {
    const a = [...document.querySelectorAll("audio.attachment-audio")].pop();
    if (!a) return null;
    if (a.readyState < 1) await new Promise((r) => { a.onloadedmetadata = r; setTimeout(r, 3000); });
    return { src: a.getAttribute("src"), ready: a.readyState, error: a.error?.code ?? null };
  });
  check("Ravi receives a playable voice message", audios === before + 1 && meta && meta.error === null && meta.ready >= 1, JSON.stringify({ ...meta, src: meta?.src?.replace(/access_token=[^&]+/, "access_token=…") }));
  const label = await ravi.locator(".message-plain-text", { hasText: "Voice message" }).count();
  check("Its caption is end-to-end encrypted and decrypts", label >= 1);
  await ravi.screenshot({ path: `${out}/v1-voice.png` });

  // ---- block ----
  await asha.locator(".header-profile-trigger").click();
  await asha.waitForTimeout(700);
  await asha.locator(".peer-block-btn").click();
  await asha.waitForTimeout(1200);
  await asha.locator(".header-profile-trigger").click();
  await asha.waitForTimeout(700);
  check("Blocker sees a blocked banner instead of the composer", (await asha.locator(".composer-blocked").count()) === 1);
  await asha.screenshot({ path: `${out}/v2-blocked.png` });

  const attempt = `blocked attempt ${Date.now()}`;
  await ravi.fill(".composer-input-field", attempt);
  await ravi.keyboard.press("Enter");
  await ravi.waitForTimeout(2500);
  const raviText = await ravi.evaluate(() => document.body.innerText);
  check("Blocked person's message is refused by the server", /blocked the other/.test(raviText) && (await asha.locator(".message-plain-text", { hasText: attempt }).count()) === 0);
  await ravi.click('[aria-label="Video Call"]');
  await ravi.waitForTimeout(2500);
  const callText = await ravi.locator(".call-ring-card").innerText().catch(() => "");
  check("Blocked person's call is refused", /blocked the other/i.test(callText) && (await asha.locator(".call-ring-card").count()) === 0, callText.replace(/\s+/g, " "));
  if (await ravi.locator(".call-ring-card button", { hasText: "Close" }).count()) await ravi.locator(".call-ring-card button", { hasText: "Close" }).click();

  // ---- unblock ----
  await asha.locator(".composer-blocked button", { hasText: "Unblock" }).click();
  await asha.waitForTimeout(1200);
  const ok = `after unblock ${Date.now()}`;
  await ravi.fill(".composer-input-field", ok);
  await ravi.keyboard.press("Enter");
  await asha.waitForTimeout(3000);
  check("After unblocking, messages flow again", (await asha.locator(".message-plain-text", { hasText: ok }).count()) === 1);
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
