import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPhone } from "../src/components/PhoneGate";

const nav = (userAgent: string, maxTouchPoints = 0, mobile?: boolean) => ({ userAgent, maxTouchPoints, userAgentData: { mobile } });

test("phones are detected so they get the app instead of the browser", () => {
  assert.equal(detectPhone(nav("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36")), "android");
  assert.equal(detectPhone(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")), "ios");
  assert.equal(detectPhone(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15", 5)), "ios", "iPad in desktop mode");
  assert.equal(detectPhone(nav("Mozilla/5.0 (Linux; X11) Chrome/131", 0, true)), "android");
});

test("computers keep the web app", () => {
  assert.equal(detectPhone(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36")), null);
  assert.equal(detectPhone(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15", 0)), null);
});
