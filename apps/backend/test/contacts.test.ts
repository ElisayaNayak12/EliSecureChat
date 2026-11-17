import { test } from "node:test";
import assert from "node:assert/strict";
import { DiscoveryBudget, contactKey, matchContacts } from "../src/users/contacts";
import type { User } from "../src/store/models";

const user = (id: string, phone: string, email?: string, status?: User["status"]): User =>
  ({ id, name: id, phone, email, passwordHash: "x", createdAt: "2026-01-01T00:00:00Z", status }) as User;

const users = [
  user("me", "9111100009", "me@gmail.com"),
  user("asha", "9111100001", "asha@gmail.com"),
  user("ravi", "+91 91111 00002"),
  user("gone", "9111100003", undefined, "SUSPENDED"),
];

test("only people in my address book who joined the app are found", () => {
  const r = matchContacts(users, "me", ["+91 91111-00001", "091111 00002", "9999999999", "friend@gmail.com"]);
  assert.deepEqual(r.matches.map((u) => u.id).sort(), ["asha", "ravi"]);
  assert.deepEqual(r.notOnApp.sort(), ["9999999999", "friend@gmail.com"]);
});

test("emails match without caring about capitals; suspended accounts and I myself are never returned", () => {
  const r = matchContacts(users, "me", ["ASHA@Gmail.com", "9111100003", "9111100009"]);
  assert.deepEqual(r.matches.map((u) => u.id), ["asha"]);
});

test("junk entries are ignored and duplicates count once", () => {
  assert.equal(contactKey("hello"), null);
  assert.equal(contactKey("12"), null);
  assert.equal(contactKey("not-an-email@"), null);
  const r = matchContacts(users, "me", ["9111100001", "+919111100001", "09111100001", "", null]);
  assert.equal(r.checked, 1);
  assert.equal(r.matches.length, 1);
});

test("a daily limit stops checking huge lists of numbers", () => {
  const b = new DiscoveryBudget();
  assert.ok(b.take("u1", 4000, 5000));
  assert.ok(!b.take("u1", 2000, 5000), "over the limit");
  assert.ok(b.take("u2", 2000, 5000), "limits are per account");
});

/* ---------------- over HTTP: nobody can list strangers ---------------- */
import { after, before } from "node:test";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let me = "", friend = "", stranger = "", chatmate = "";
let tok = "";
before(async () => {
  t = await bootApp("contacts");
  me = t.createUser("Meera Iyer", "9500000001", "meera-pass-1");
  friend = t.createUser("Farah Khan", "9500000002", "farah-pass-1");
  stranger = t.createUser("Sanjay Rao", "9500000003", "sanjay-pass-1");
  chatmate = t.createUser("Chetan Das", "9500000004", "chetan-pass-1");
  t.store.createOneToOneChat(me, chatmate);
  tok = t.tokenFor(me);
});
after(() => t.close());

test("search never lists all users, and strangers are not found by part of a name or number", async () => {
  assert.deepEqual((await call(t.base, "GET", "/users/search?q=", { token: tok })).body, []);
  assert.deepEqual((await call(t.base, "GET", "/users/search?q=sanjay", { token: tok })).body, []);
  assert.deepEqual((await call(t.base, "GET", "/users/search?q=950000", { token: tok })).body.map((u: { id: string }) => u.id).filter((id: string) => id === stranger), []);
  // People I already chat with can be found by name.
  assert.ok((await call(t.base, "GET", "/users/search?q=chetan", { token: tok })).body.some((u: { id: string }) => u.id === chatmate));
  // An exact number still works, like typing a number into WhatsApp.
  assert.ok((await call(t.base, "GET", "/users/search?q=%2B919500000003", { token: tok })).body.some((u: { id: string }) => u.id === stranger));
});

test("checking my address book saves only matches as my contacts and lists the rest for invites", async () => {
  const r = await call(t.base, "POST", `/users/${me}/contacts/discover`, { token: tok, body: { entries: ["+91 95000 00002", "9876500000"] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.matches.map((u: { id: string }) => u.id), [friend]);
  assert.deepEqual(r.body.notOnApp, ["9876500000"]);
  const list = await call(t.base, "GET", `/users/${me}/contacts`, { token: tok });
  assert.deepEqual(list.body.map((u: { id: string }) => u.id), [friend]);
  assert.ok(!("email" in list.body[0]), "contacts never expose email addresses");
  // Now Farah can be found by name, because she is my contact.
  assert.ok((await call(t.base, "GET", "/users/search?q=farah", { token: tok })).body.some((u: { id: string }) => u.id === friend));
  // Someone else's contact list is private.
  const other = await call(t.base, "GET", `/users/${friend}/contacts`, { token: tok });
  assert.equal(other.status, 403);
});

test("add by exact number, remove, and 'not on the app yet' for unknown numbers", async () => {
  const add = await call(t.base, "POST", `/users/${me}/contacts`, { token: tok, body: { identifier: "9500000003" } });
  assert.equal(add.status, 200);
  assert.equal(add.body.id, stranger);
  const missing = await call(t.base, "POST", `/users/${me}/contacts`, { token: tok, body: { identifier: "9876511111" } });
  assert.equal(missing.status, 404);
  assert.match(JSON.stringify(missing.body), /NOT_ON_ELISECURECHAT/);
  await call(t.base, "DELETE", `/users/${me}/contacts/${stranger}`, { token: tok });
  const list = await call(t.base, "GET", `/users/${me}/contacts`, { token: tok });
  assert.ok(!list.body.some((u: { id: string }) => u.id === stranger));
});
