/** Languages + preferences API, called with real access tokens. */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let userId = "";
let token = "";
let otherToken = "";

before(async () => {
  t = await bootApp("api");
  userId = t.createUser("Test Signer", "9100000001");
  token = t.tokenFor(userId);
  otherToken = t.tokenFor(t.createUser("Someone Else", "9100000002"));
});
after(() => t.close());

test("GET /languages/sign lists the four packs (public)", async () => {
  const { status, body } = await call(t.base, "GET", "/languages/sign");
  assert.equal(status, 200);
  assert.deepEqual(body.map((p: { id: string }) => p.id), ["isl", "asl", "bsl", "auslan"]);
});

test("GET /languages/sign/:id returns one pack or 404", async () => {
  assert.equal((await call(t.base, "GET", "/languages/sign/isl")).body.name, "Indian Sign Language");
  assert.equal((await call(t.base, "GET", "/languages/sign/zzz")).status, 404);
});

test("GET /languages/spoken", async () => {
  const { status, body } = await call(t.base, "GET", "/languages/spoken");
  assert.equal(status, 200);
  assert.ok(body.some((l: { id: string }) => l.id === "en-IN"));
});

test("preferences require a token, and only the owner may read or change them", async () => {
  assert.equal((await call(t.base, "GET", `/users/${userId}/preferences`)).status, 401);
  assert.equal((await call(t.base, "GET", `/users/${userId}/preferences`, { token: otherToken })).status, 403);
  assert.equal((await call(t.base, "PATCH", `/users/${userId}/preferences`, { token: otherToken, body: { theme: "dark" } })).status, 403);
  const { status, body } = await call(t.base, "GET", `/users/${userId}/preferences`, { token });
  assert.equal(status, 200);
  assert.equal(body.preferredSignLanguage, null);
});

test("PATCH preferences saves, persists to disk and survives a reload", async () => {
  const { status, body } = await call(t.base, "PATCH", `/users/${userId}/preferences`, {
    token,
    body: { preferredSignLanguage: "isl", accessibility: { highContrast: true, textSize: "x-large" } },
  });
  assert.equal(status, 200);
  assert.equal(body.preferredSignLanguage, "isl");
  const onDisk = JSON.parse(readFileSync(process.env.STORE_FILE!, "utf8"));
  assert.equal(onDisk.users.find((u: { id: string }) => u.id === userId).preferences.accessibility.textSize, "x-large");
  const { InMemoryStore } = await import("../src/store/in-memory.store");
  const reloaded = new InMemoryStore();
  reloaded.onModuleInit();
  assert.equal(reloaded.users.find((u) => u.id === userId)?.preferences?.preferredSignLanguage, "isl");
});

test("PATCH preferences rejects invalid input with 400 and lists issues", async () => {
  const { status, body } = await call(t.base, "PATCH", `/users/${userId}/preferences`, { token, body: { preferredSignLanguage: "klingon", voice: { speakingRate: 9 } } });
  assert.equal(status, 400);
  assert.equal(body.error, "INVALID_PREFERENCES");
  assert.equal(body.issues.length, 2);
  assert.equal((await call(t.base, "GET", `/users/${userId}/preferences`, { token })).body.preferredSignLanguage, "isl");
});

test("other users see a public profile only (no email, no preferences)", async () => {
  t.store.users.find((u) => u.id === userId)!.email = "private@example.com";
  const theirs = await call(t.base, "GET", `/users/${userId}`, { token: otherToken });
  assert.equal(theirs.status, 200);
  assert.equal(theirs.body.email, undefined);
  assert.equal(theirs.body.preferences, undefined);
  const mine = await call(t.base, "GET", `/users/${userId}`, { token });
  assert.equal(mine.body.email, "private@example.com");
});
