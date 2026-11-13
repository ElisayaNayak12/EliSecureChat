import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTone } from "../src/features/tone";
import { capsuleLabel, capsuleText, parseCapsule } from "../src/features/capsule";
import { gifText, parseRich, richLabel, stickerText, suggestFor } from "../src/stickers/expressions";
import { STICKERS } from "../src/stickers/leafy";

test("tone check flags harsh words and shouting, and offers a kinder version", () => {
  const r = checkTone("This is ridiculous, you are useless!!!");
  assert.equal(r.harsh, true);
  assert.ok(!/useless|ridiculous/i.test(r.kinder), r.kinder);
  assert.ok(!r.kinder.includes("!!!"));
  assert.equal(checkTone("WHERE ARE YOU NOW").harsh, true, "all caps reads as shouting");
  assert.equal(checkTone("See you at 8, thanks!").harsh, false, "friendly messages are left alone");
});

test("time capsule stays sealed until its date, then opens", () => {
  const text = capsuleText("2027-01-02", "Happy new year!");
  const before = parseCapsule(text, new Date("2026-12-31T12:00:00"));
  assert.deepEqual(before, { opensOn: "2027-01-02", text: "Happy new year!", open: false });
  assert.equal(parseCapsule(text, new Date("2027-01-02T09:00:00"))?.open, true);
  assert.equal(parseCapsule("just text"), null);
  assert.match(capsuleLabel(capsuleText("2999-01-01", "secret")) ?? "", /^Time capsule · opens/);
  assert.ok(!(capsuleLabel(capsuleText("2999-01-01", "secret")) ?? "").includes("secret"), "chat list never leaks sealed text");
});

test("stickers and GIFs round-trip through the encrypted text encoding", () => {
  assert.ok(STICKERS.length >= 23);
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length, "sticker ids are unique");
  const s = parseRich(stickerText("thanks"));
  assert.equal(s?.kind, "sticker");
  assert.equal(parseRich(gifText("party-time"))?.kind, "gif");
  assert.equal(parseRich("::sticker:does-not-exist::"), null);
  assert.equal(parseRich("hello ::sticker:thanks::"), null, "only a whole message is a sticker");
  assert.equal(richLabel(stickerText("thanks")), "Sticker · Thank you");
});

test("smart suggestions follow what the user types", () => {
  const b = suggestFor("Happy birthday Asha!");
  assert.ok(b?.moods.includes("birthday"));
  assert.ok(b?.emoji.includes("🎂"));
  assert.ok(b?.gifs.some((g) => g.id === "happy-birthday"));
  assert.ok(suggestFor("thank you so much")?.stickers.some((st) => st.id === "thanks"));
  assert.equal(suggestFor("the report is attached"), null, "no suggestions for neutral text");
  assert.equal(suggestFor("a"), null);
});
