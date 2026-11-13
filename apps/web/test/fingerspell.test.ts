import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALPHABETS, alphabetFor, sentenceWords, tokenize, tokenDuration } from "../src/ai/fingerspell";

const here = dirname(fileURLToPath(import.meta.url));
const letters = (toks: ReturnType<typeof tokenize>) => toks.filter((t) => t.kind === "letter").map((t) => (t as { char: string }).char).join("");

test("every letter/number we spell has a real hand photo on disk", () => {
  for (const [alpha, def] of Object.entries(ALPHABETS)) {
    for (const ch of def.chars) {
      assert.ok(existsSync(join(here, "..", "public", "signs", alpha, `${ch}.jpg`)), `${alpha}/${ch}.jpg is missing`);
    }
  }
});

test("only ISL and ASL have fingerspelling photos", () => {
  assert.equal(alphabetFor("isl"), "isl");
  assert.equal(alphabetFor("asl"), "asl");
  assert.equal(alphabetFor("bsl"), null);
  assert.equal(alphabetFor(null), null);
});

test("words become letters with word gaps; punctuation and case are ignored", () => {
  const t = tokenize("Hello, Asha!", "isl");
  assert.equal(letters(t), "HELLOASHA");
  assert.equal(t.filter((x) => x.kind === "gap").length, 1);
  assert.deepEqual(sentenceWords("Hello, Asha!"), ["Hello,", "Asha!"]);
  const first = t[0] as { src: string; word: number };
  assert.equal(first.src, "/signs/isl/H.jpg");
  assert.equal(first.word, 0);
});

test("ISL spells numbers 1-9; ASL (no number photos) shows them as text", () => {
  assert.equal(letters(tokenize("Room 42", "isl")), "ROOM42");
  const asl = tokenize("Room 42", "asl");
  assert.equal(letters(asl), "ROOM");
  assert.deepEqual(asl.filter((x) => x.kind === "text").map((x) => (x as { text: string }).text), ["42"]);
  assert.ok(tokenize("10 people", "isl").some((x) => x.kind === "text"), "0 has no ISL photo, so 10 is shown as text");
});

test("words in other scripts are shown as text, never guessed", () => {
  const t = tokenize("नमस्ते Ravi", "isl");
  assert.equal(t[0].kind, "text");
  assert.equal((t[0] as { text: string }).text, "नमस्ते");
  assert.equal(letters(t), "RAVI");
  assert.equal(letters(tokenize("Café", "asl")), "CAFE", "accents are removed before spelling");
});

test("speed changes letter timing", () => {
  const [h] = tokenize("H", "isl");
  assert.ok(tokenDuration(h, "slow") > tokenDuration(h, "normal"));
  assert.ok(tokenDuration(h, "normal") > tokenDuration(h, "fast"));
});
