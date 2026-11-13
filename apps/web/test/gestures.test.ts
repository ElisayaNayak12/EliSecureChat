import { test } from "node:test";
import assert from "node:assert/strict";
import { GestureDebouncer, defaultMeanings, sanitizeMeanings, type GestureFrame } from "../src/ai/gestures";

/** Feeds frames at a given fps; returns the events fired. */
function feed(d: GestureDebouncer, segments: { frame: GestureFrame; ms: number }[], fps = 20) {
  const step = 1000 / fps;
  let t = 0;
  const events = [];
  for (const seg of segments) {
    const end = t + seg.ms;
    for (; t < end; t += step) {
      const e = d.push(seg.frame, t);
      if (e) events.push(e);
    }
  }
  return events;
}
const g = (name: string, ms: number, score = 0.9) => ({ frame: { name, score }, ms });
const none = (ms: number) => ({ frame: null, ms });

test("a held gesture fires once, not every frame", () => {
  const events = feed(new GestureDebouncer(), [g("Thumb_Up", 2000)]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { gesture: "Thumb_Up", score: 0.9 });
});

test("timing is the same on a fast laptop (30 fps) and a slow phone (5 fps)", () => {
  for (const fps of [30, 5]) {
    assert.equal(feed(new GestureDebouncer(), [g("Victory", 700)], fps).length, 1, `${fps} fps: 0.7 s hold fires`);
    assert.equal(feed(new GestureDebouncer(), [g("Victory", 250)], fps).length, 0, `${fps} fps: 0.25 s flicker ignored`);
  }
});

test("the same gesture can fire again only after it is released", () => {
  const events = feed(new GestureDebouncer(), [g("Thumb_Up", 600), none(100), g("Thumb_Up", 600), none(500), g("Thumb_Up", 600)]);
  assert.equal(events.length, 2, "a 0.1 s dropout is not a release; a 0.5 s one is");
});

test("switching gestures fires each one", () => {
  const events = feed(new GestureDebouncer(), [g("Open_Palm", 600), g("Thumb_Down", 900)]);
  assert.deepEqual(events.map((e) => e.gesture), ["Open_Palm", "Thumb_Down"]);
});

test("low-confidence and unknown categories are ignored", () => {
  assert.equal(feed(new GestureDebouncer(), [g("Thumb_Up", 1000, 0.4), g("None", 1000), g("Unknown_Thing", 1000)]).length, 0);
});

test("meanings: defaults, user overrides, junk ignored, empty string disables", () => {
  assert.equal(defaultMeanings().Thumb_Up, "Yes");
  const m = sanitizeMeanings({ Thumb_Up: " Okay ", Victory: "", Hack: "x", Open_Palm: 42 });
  assert.equal(m.Thumb_Up, "Okay");
  assert.equal(m.Victory, "");
  assert.equal(m.Open_Palm, "Hello");
  assert.equal("Hack" in m, false);
  assert.deepEqual(sanitizeMeanings(null), defaultMeanings());
});
