import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  PreferencesValidationError,
  applyPreferencesPatch,
  resolvePreferences,
} from "../src/users/preferences";

const fixedNow = new Date("2026-11-10T09:00:00.000Z");

test("resolvePreferences fills defaults for records saved before preferences existed", () => {
  assert.deepEqual(resolvePreferences(undefined), DEFAULT_PREFERENCES);
  const partial = resolvePreferences({ accessibility: { highContrast: true } as never });
  assert.equal(partial.accessibility.highContrast, true);
  assert.equal(partial.accessibility.textSize, "default");
  assert.equal(partial.voice.speakingRate, 1);
});

test("a valid partial patch merges and stamps updatedAt", () => {
  const next = applyPreferencesPatch(
    DEFAULT_PREFERENCES,
    { preferredSignLanguage: "isl", accessibility: { textSize: "large" }, voice: { speakingRate: 1.25 } },
    fixedNow,
  );
  assert.equal(next.preferredSignLanguage, "isl");
  assert.equal(next.accessibility.textSize, "large");
  assert.equal(next.accessibility.highContrast, false, "untouched fields keep their value");
  assert.equal(next.voice.speakingRate, 1.25);
  assert.equal(next.updatedAt, fixedNow.toISOString());
});

test("the input object is not mutated", () => {
  const current = resolvePreferences(undefined);
  applyPreferencesPatch(current, { accessibility: { highContrast: true } }, fixedNow);
  assert.equal(current.accessibility.highContrast, false);
});

test("preferredSignLanguage can be cleared with null", () => {
  const withIsl = applyPreferencesPatch(DEFAULT_PREFERENCES, { preferredSignLanguage: "isl" }, fixedNow);
  const cleared = applyPreferencesPatch(withIsl, { preferredSignLanguage: null }, fixedNow);
  assert.equal(cleared.preferredSignLanguage, null);
});

function issuesFor(patch: unknown): string[] {
  try {
    applyPreferencesPatch(DEFAULT_PREFERENCES, patch, fixedNow);
  } catch (err) {
    assert.ok(err instanceof PreferencesValidationError);
    return err.issues;
  }
  assert.fail("expected a validation error");
}

test("rejects unknown sign-language packs and spoken languages", () => {
  assert.match(issuesFor({ preferredSignLanguage: "klingon" })[0], /not a known sign-language pack/);
  assert.match(issuesFor({ preferredLanguage: "xx-XX" })[0], /not a supported language/);
});

test("rejects unknown fields instead of silently dropping them", () => {
  assert.match(issuesFor({ fontFamily: "Comic Sans" })[0], /Unknown field "fontFamily"/);
  assert.match(issuesFor({ accessibility: { blink: true } })[0], /accessibility\.blink/);
});

test("rejects wrong types and out-of-range values, reporting every issue", () => {
  const issues = issuesFor({
    accessibility: { highContrast: "yes", textSize: "huge" },
    voice: { speakingRate: 5 },
    theme: "neon",
  });
  assert.equal(issues.length, 4);
});

test("rejects non-object bodies", () => {
  assert.match(issuesFor(null)[0], /JSON object/);
  assert.match(issuesFor(["isl"])[0], /JSON object/);
});

test("the default theme is 'system' so a saved accessibility change never forces a theme", () => {
  assert.equal(DEFAULT_PREFERENCES.theme, "system");
  const next = applyPreferencesPatch(DEFAULT_PREFERENCES, { accessibility: { textSize: "large" } }, fixedNow);
  assert.equal(next.theme, "system");
});
