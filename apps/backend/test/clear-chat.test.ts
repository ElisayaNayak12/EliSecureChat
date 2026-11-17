import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { bootApp, call, type TestApp } from "./helpers";

let t: TestApp;
let a = "", b = "", aTok = "", bTok = "", chat = "";

before(async () => {
  t = await bootApp("clearchat");
  a = t.createUser("Anu", "9600000001", "anu-pass-12");
  b = t.createUser("Bala", "9600000002", "bala-pass-12");
  aTok = t.tokenFor(a);
  bTok = t.tokenFor(b);
  chat = t.store.createOneToOneChat(a, b).id;
});
after(() => t.close());

const send = (token: string, senderId: string, text: string) =>
  call(t.base, "POST", "/messages", { token, body: { chatId: chat, senderId, encryptedContent: text } });
const texts = async (token: string) => (await call(t.base, "GET", `/messages/${chat}`, { token })).body.map((m: { encryptedContent: string }) => m.encryptedContent);

test("clearing a chat hides the history only for the person who cleared it", async () => {
  await send(aTok, a, "hello");
  await send(bTok, b, "hi Anu");
  const r = await call(t.base, "POST", `/chats/${chat}/clear-history`, { token: aTok, body: { userId: a } });
  assert.equal(r.status, 201);
  assert.equal(r.body.scope, "me");
  assert.equal(r.body.clearedMessages, 2);

  assert.deepEqual(await texts(aTok), [], "Anu sees an empty chat");
  assert.deepEqual(await texts(bTok), ["hello", "hi Anu"], "Bala still has the full history");

  const sumA = (await call(t.base, "GET", `/chats/summaries?userId=${a}`, { token: aTok })).body[0];
  assert.equal(sumA.lastMessage, undefined, "Anu's chat list shows no old preview");
  assert.equal(sumA.unreadCount, 0);
});

test("new messages after the clear show up for both people", async () => {
  await new Promise((r) => setTimeout(r, 5));
  await send(bTok, b, "are you there?");
  assert.deepEqual(await texts(aTok), ["are you there?"]);
  assert.deepEqual(await texts(bTok), ["hello", "hi Anu", "are you there?"]);
});
