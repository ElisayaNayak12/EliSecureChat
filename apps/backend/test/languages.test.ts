import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGN_LANGUAGE_PACKS, SPOKEN_LANGUAGES, findSignLanguage } from "../src/languages/language-packs";

test("the four spec languages are registered with unique ids", () => {
  const ids = SIGN_LANGUAGE_PACKS.map((p) => p.id);
  assert.deepEqual([...ids].sort(), ["asl", "auslan", "bsl", "isl"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("ISL is the only pack in development (spec section 2)", () => {
  const inDev = SIGN_LANGUAGE_PACKS.filter((p) => p.lifecycle === "IN_DEVELOPMENT").map((p) => p.id);
  assert.deepEqual(inDev, ["isl"]);
});

test("no pack claims AI capability that does not exist yet (spec section 13)", () => {
  for (const pack of SIGN_LANGUAGE_PACKS) {
    assert.equal(pack.recognitionModel, null, `${pack.id} recognition model`);
    assert.equal(pack.translationModel, null, `${pack.id} translation model`);
    assert.equal(pack.modelVersion, null, `${pack.id} model version`);
    assert.equal(pack.videoLibrary.verifiedClipCount, 0, `${pack.id} video clips`);
    assert.equal(pack.vocabulary.glossCount, 0, `${pack.id} vocabulary`);
    assert.equal(pack.evaluation.recognitionAccuracy, null, `${pack.id} accuracy`);
    for (const ds of pack.datasetReferences) {
      assert.equal(ds.licenseReview, "NOT_REVIEWED", `${pack.id}/${ds.name} licence must not be assumed`);
    }
  }
});

test("every paired spoken language exists in the spoken-language list", () => {
  const spoken = new Set(SPOKEN_LANGUAGES.map((l) => l.id));
  for (const pack of SIGN_LANGUAGE_PACKS) {
    for (const id of pack.pairedSpokenLanguages) assert.ok(spoken.has(id), `${pack.id} -> ${id}`);
  }
});

test("findSignLanguage", () => {
  assert.equal(findSignLanguage("isl")?.code, "ISL");
  assert.equal(findSignLanguage("nope"), undefined);
});
