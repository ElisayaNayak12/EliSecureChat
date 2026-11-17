import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FingerspellDetector, fingerspellGlosses, letterOf, templatesFromRaw, templatesFromSamples } from "../src/ai/fingerspellDetector";
import { frameFeatures, type HandObservation, type RawHand } from "../src/ai/signFeatures";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "signs", "asl", "landmarks.json"), "utf8")).letters as Record<string, RawHand[]>;
const templates = templatesFromRaw(raw, true);

/** A frame of the given ASL letter, with small random jitter (like a real camera), optionally mirrored (left hand) or moved. */
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
function frame(char: string, opts: { jitter?: number; mirrored?: boolean; dx?: number } = {}) {
  const h = [...raw[char]].sort((a, b) => b.s - a.s)[0];
  const j = opts.jitter ?? 0.0015;
  const obs: HandObservation = {
    handedness: opts.mirrored ? "Left" : "Right",
    score: 0.95,
    landmarks: Array.from({ length: 21 }, (_, i) => {
      const x = h.p[i * 3] + rnd() * j;
      return { x: (opts.mirrored ? 1 - x : x) + (opts.dx ?? 0), y: h.p[i * 3 + 1] + rnd() * j, z: h.p[i * 3 + 2] + rnd() * j };
    }),
  };
  return frameFeatures([obs]);
}

/** Holds each letter for `ms` at 30 fps (with a short transition between letters) and returns what was read. */
function spell(det: FingerspellDetector, letters: string[], opts: { ms?: number; mirrored?: boolean; bounce?: boolean } = {}) {
  let t = 0;
  const read: string[] = [];
  letters.forEach((ch, idx) => {
    const repeat = idx > 0 && letters[idx - 1] === ch;
    for (let k = 0; k * 33 < (opts.ms ?? 450); k++) {
      const e = det.push(frame(ch, { mirrored: opts.mirrored, dx: repeat && opts.bounce && k < 3 ? 0.08 : 0 }), (t += 33));
      if (e?.kind === "letter") read.push(e.char);
    }
  });
  return read.join("");
}

test("letter glosses: FS-A is the letter A; each language has its alphabet", () => {
  assert.equal(letterOf("FS-A"), "A");
  assert.equal(letterOf("HELLO"), null);
  assert.equal(fingerspellGlosses("asl").length, 35);
  assert.equal(fingerspellGlosses("bsl").length, 26);
});

test("built-in ASL examples cover the static letters", () => {
  assert.equal(new Set(templates.map((t) => t.char)).size, 24);
  assert.ok(!templates.some((t) => t.char === "J" || t.char === "Z"), "J and Z move, so they are learned from recordings");
});

test("holding letters spells a word, letter by letter", () => {
  const det = new FingerspellDetector(templates);
  assert.equal(spell(det, ["C", "A", "B"]), "CAB");
});

test("left-handed signers are read the same as right-handed ones", () => {
  const det = new FingerspellDetector(templates);
  assert.equal(spell(det, ["C", "A", "B"], { mirrored: true }), "CAB");
});

test("a double letter needs a small bounce, so one long hold is not read twice", () => {
  const still = new FingerspellDetector(templates);
  assert.equal(spell(still, ["O", "O"]), "O", "holding the same shape longer gives one letter");
  const bounced = new FingerspellDetector(templates);
  assert.equal(spell(bounced, ["O", "O"], { bounce: true }), "OO");
});

test("moving hands (no hold) are never read as letters", () => {
  const det = new FingerspellDetector(templates);
  let t = 0;
  let letters = 0;
  for (let k = 0; k < 60; k++) {
    const ch = ["A", "B", "C", "L"][k % 4]; // a new shape every frame
    if (det.push(frame(ch), (t += 33))?.kind === "letter") letters++;
  }
  assert.equal(letters, 0);
});

test("the signer's own recorded letters are used too (e.g. J, which moves)", () => {
  const recorded = [{ gloss: "FS-J", frames: Array.from({ length: 20 }, () => frame("I", { dx: 0.2 })) }];
  const own = templatesFromSamples(recorded);
  assert.ok(own.length > 0 && own.every((t) => t.char === "J"));
});
