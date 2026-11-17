// Real two-browser video call: the hearing person's words are shown to the Deaf person as real ISL
// fingerspelling photos, in real time; the hearing person sees the same preview and can fix a caption.
import { chromium } from "playwright-core";

const out = process.argv[2] ?? ".";
const WEB = "http://localhost:5173";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
async function signIn(phone, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${tag}:`, e.message));
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill("#phone-input", phone);
  await page.fill("#pwd-input", "Test@1234");
  await page.click("button[type=submit]");
  await page.waitForTimeout(4500);
  return page;
}
/** Collects the sequence of distinct letter photos shown by a player for `ms` milliseconds. */
async function watchLetters(page, selector, ms) {
  return page.evaluate(async ({ selector, ms }) => {
    const seen = [];
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const img = document.querySelector(`${selector} .fs-photo`);
      const src = img?.getAttribute("src") ?? "";
      const m = src.match(/\/signs\/(\w+)\/(\w)\.jpg$/);
      const key = m ? `${m[1]}:${m[2]}` : null;
      if (key && seen[seen.length - 1] !== key) seen.push(key);
      await new Promise((r) => setTimeout(r, 60));
    }
    return seen;
  }, { selector, ms });
}

try {
  const ravi = await signIn("9111100002", "ravi");
  const asha = await signIn("9111100001", "asha");
  await ravi.locator(".chat-summary-item", { hasText: "Asha" }).first().click();
  await ravi.waitForTimeout(800);
  await ravi.click('[aria-label="Video Call"]');
  const rang = await asha.waitForSelector(".call-ring-card", { timeout: 20000 }).then(() => true).catch(() => false);
  check("Call rings on Asha's browser", rang);
  await asha.click('[aria-label="Accept video call"]');
  await asha.waitForSelector(".call-screen.premium", { timeout: 15000 });
  await ravi.waitForSelector(".call-screen.premium", { timeout: 15000 });
  check("Both sides show the premium call screen", true);
  await asha.waitForTimeout(2500);

  check("Asha (Deaf, ISL) has the Speech-to-sign player", (await asha.locator(".cp-sign-stage .fs-player").count()) === 1, await asha.locator(".cp-sign-stage .fs-lang").innerText().catch(() => ""));
  const preview = await ravi.waitForSelector(".cp-preview .fs-player", { timeout: 10000 }).then(() => true).catch(() => false);
  check("Ravi (hearing) gets the 'What Asha sees' preview (Asha's sign language was shared)", preview, await ravi.locator(".cp-preview .fs-title").innerText().catch(() => ""));
  check("Ravi's speech captions switched on automatically for a signer", await ravi.locator('[aria-label="Speech captions"]').getAttribute("aria-checked") === "true");

  // Ravi says something (typed caption: deterministic stand-in for speech recognition, same path).
  await ravi.fill(".cp-type input", "Hello Asha 42");
  await ravi.click(".cp-type button");
  const shots = (async () => {
    await asha.waitForTimeout(1800);
    await asha.screenshot({ path: `${out}/fs-asha-live.png` });
    await ravi.screenshot({ path: `${out}/fs-ravi-live.png` });
  })();
  const sawRepeat = asha.waitForSelector(".cp-sign-stage .fs-repeat", { timeout: 9000 }).then(() => true).catch(() => false);
  const [ashaSeq, raviSeq] = await Promise.all([watchLetters(asha, ".cp-sign-stage", 12000), watchLetters(ravi, ".cp-preview", 12000)]);
  await shots;
  check("The double L in HELLO is marked 'again' so it is not missed", await sawRepeat);
  const box = await asha.locator(".cp-sign-stage .fs-stage").boundingBox();
  check("Asha's signing player stays on screen after the transcript updates", !!box && box.y >= 0 && box.y + box.height <= 900, box ? `top ${Math.round(box.y)}px` : "not visible");
  const want = ["isl:H", "isl:E", "isl:L", "isl:O", "isl:A", "isl:S", "isl:H", "isl:A", "isl:4", "isl:2"];
  const inOrder = (seq) => { let i = 0; for (const k of seq) if (k === want[i]) i++; return i === want.length; };
  check("Asha sees real ISL hand photos spelling 'HELLO ASHA 42' in order", inOrder(ashaSeq), ashaSeq.map((k) => k.split(":")[1]).join(""));
  check("Ravi's preview shows exactly the same signs", inOrder(raviSeq), raviSeq.map((k) => k.split(":")[1]).join(""));
  await asha.screenshot({ path: `${out}/fs-asha.png` });
  await ravi.screenshot({ path: `${out}/fs-ravi.png` });
  const photoOk = await asha.evaluate(async () => {
    const r = await fetch("/signs/isl/H.jpg");
    return r.ok && (r.headers.get("content-type") || "").includes("image");
  });
  check("Hand photos are served by the app", photoOk);

  // Ravi notices a mistake and fixes it; Asha receives the corrected sentence.
  const heard = await ravi.locator(".cp-heard").innerText().catch(() => "");
  check("Ravi sees what was heard/sent", /Hello Asha 42/.test(heard), heard.replace(/\s+/g, " "));
  await ravi.click(".cp-heard button");
  await ravi.fill(".cp-fix input", "Hello Asha 43");
  await ravi.click(".cp-fix button:has-text('Resend')");
  const fixSeq = await watchLetters(asha, ".cp-sign-stage", 20000);
  check("The corrected sentence reaches Asha as signs (now ends with 3)", fixSeq.includes("isl:3"), fixSeq.map((k) => k.split(":")[1]).join(""));
  const marked = await asha.locator(".tr-entry.peer", { hasText: "Hello Asha 43" }).locator(".tr-badge", { hasText: "corrected" }).count();
  check("Asha's transcript marks it as corrected", marked >= 1);
  await asha.click('[aria-label="End call"]');
} catch (err) {
  check("No step crashed", false, String(err.message ?? err).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
