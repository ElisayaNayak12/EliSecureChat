import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

const TEST_PORT = 3301;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PASSWORD = "secret123";

function randomPhone() {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

async function waitForHealth(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return true;
    } catch {
      // keep polling
    }
    await delay(300);
  }
  return false;
}

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${await response.text()}`);
  }
  return response.json();
}

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed: ${await response.text()}`);
  }
  return response.json();
}

function waitForEvent(socket, event, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

function waitForConnect(socket, timeoutMs = 8000) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      reject(new Error("Socket connect timeout"));
    }, timeoutMs);

    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (error) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      reject(error instanceof Error ? error : new Error("Socket connect error"));
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onError);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function runTest() {
  console.log("Starting isolated backend for test...");

  let backend = null;
  backend = spawn(process.execPath, ["apps/backend/dist/main.js"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, PORT: String(TEST_PORT) },
  });
  backend.stdout.on("data", (chunk) => process.stdout.write(chunk));
  backend.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const healthy = await waitForHealth();
  if (!healthy) throw new Error("Backend failed health check");

  const cleanup = () => {
    if (backend && !backend.killed) {
      backend.kill("SIGTERM");
    }
  };
  process.on("exit", cleanup);

  let socket1;
  let socket2;
  try {
    const user1 = await post("/auth/sign-up", {
      name: "Realtime User One",
      phone: randomPhone(),
      email: `u1_${Date.now()}@example.com`,
      password: PASSWORD,
    });
    const user2 = await post("/auth/sign-up", {
      name: "Realtime User Two",
      phone: randomPhone(),
      email: `u2_${Date.now()}@example.com`,
      password: PASSWORD,
    });

    const chat = await post("/chats", {
      type: "ONE_TO_ONE",
      memberIds: [user1.user.id, user2.user.id],
    });
    console.log("Users and chat created.");

    socket1 = io(`${BASE_URL}/chat`, { path: "/socket.io", transports: ["websocket"] });
    socket2 = io(`${BASE_URL}/chat`, { path: "/socket.io", transports: ["websocket"] });
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);
    console.log("Sockets connected.");

    await emitAck(socket1, "register_presence", { userId: user1.user.id });
    await emitAck(socket2, "register_presence", { userId: user2.user.id });
    await emitAck(socket1, "join_chat", { chatId: chat.id });
    await emitAck(socket2, "join_chat", { chatId: chat.id });
    console.log("Presence registered and chat joined.");

    const typingPromise = waitForEvent(
      socket2,
      "typing_update",
      (p) => p.chatId === chat.id && p.userId === user1.user.id && p.isTyping === true,
    );
    await emitAck(socket1, "typing_start", { chatId: chat.id, userId: user1.user.id });
    await typingPromise;
    await emitAck(socket1, "typing_stop", { chatId: chat.id, userId: user1.user.id });
    console.log("Typing signal verified.");

    const receivePromise = waitForEvent(
      socket2,
      "receive_message",
      (m) => m.chatId === chat.id && m.senderId === user1.user.id,
    );
    const firstMessage = await emitAck(socket1, "send_message", {
      chatId: chat.id,
      senderId: user1.user.id,
      encryptedContent: b64("hello from user one"),
      messageType: "TEXT",
    });

    await receivePromise;
    console.log("Message receive verified.");

    const messagesAfterFirstSend = await get(`/messages/${chat.id}`);
    const persistedFirst = messagesAfterFirstSend.find((m) => m.id === firstMessage.id);
    if (!persistedFirst) throw new Error("First message not persisted");
    const deliveredTo = Array.isArray(persistedFirst.deliveredTo) ? persistedFirst.deliveredTo : [];
    if (!deliveredTo.includes(user2.user.id)) {
      const deliveredPromise = waitForEvent(
        socket1,
        "messages_delivered",
        (p) => p.chatId === chat.id && p.userId === user2.user.id && p.messageIds.includes(firstMessage.id),
      );
      await emitAck(socket2, "ack_delivered", {
        chatId: chat.id,
        userId: user2.user.id,
        messageIds: [firstMessage.id],
      });
      await deliveredPromise;
    }
    console.log("Delivery verified.");

    const readPromise = waitForEvent(
      socket1,
      "messages_read",
      (p) => p.chatId === chat.id && p.userId === user2.user.id && p.messageIds.includes(firstMessage.id),
    );
    await emitAck(socket2, "mark_read", {
      chatId: chat.id,
      userId: user2.user.id,
      messageIds: [firstMessage.id],
    });
    await readPromise;
    console.log("Read receipt verified.");

    const replyMessage = await emitAck(socket2, "send_message", {
      chatId: chat.id,
      senderId: user2.user.id,
      encryptedContent: b64("reply from user two"),
      messageType: "TEXT",
      replyToMessageId: firstMessage.id,
    });
    console.log("Reply flow verified.");

    const reactionEvent = waitForEvent(
      socket1,
      "reaction_update",
      (p) => p.chatId === chat.id && p.messageId === firstMessage.id,
    );
    await emitAck(socket2, "toggle_reaction", {
      messageId: firstMessage.id,
      userId: user2.user.id,
      emoji: "👍",
    });
    await reactionEvent;
    console.log("Reaction flow verified.");

    await post(`/messages/${firstMessage.id}/pin`, { userId: user1.user.id });
    const summariesAfterPin = await get(`/chats/summaries?userId=${user1.user.id}`);
    const pinnedSummary = summariesAfterPin.find((s) => s.chat.id === chat.id);
    if (!pinnedSummary?.chat?.pinnedMessageId) {
      throw new Error("Pin metadata not persisted");
    }
    await post(`/messages/${chat.id}/unpin`, { userId: user1.user.id });
    const summariesAfterUnpin = await get(`/chats/summaries?userId=${user1.user.id}`);
    const unpinnedSummary = summariesAfterUnpin.find((s) => s.chat.id === chat.id);
    if (unpinnedSummary?.chat?.pinnedMessageId) {
      throw new Error("Unpin did not clear metadata");
    }
    console.log("Pin/unpin flow verified.");

    const form = new FormData();
    form.append("file", new Blob(["proof file"], { type: "text/plain" }), "proof.txt");
    const uploadResponse = await fetch(`${BASE_URL}/uploads`, { method: "POST", body: form });
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${await uploadResponse.text()}`);
    }
    const upload = await uploadResponse.json();

    await emitAck(socket1, "send_message", {
      chatId: chat.id,
      senderId: user1.user.id,
      encryptedContent: b64(`[Attachment] ${upload.fileName}`),
      messageType: "FILE",
      attachmentUrl: upload.url,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      fileSize: upload.fileSize,
    });
    console.log("Attachment message sent.");

    const messages = await get(`/messages/${chat.id}`);
    const attachmentExists = messages.some((m) => m.attachmentUrl && m.fileName === upload.fileName);
    if (!attachmentExists) {
      throw new Error("Attachment message not persisted");
    }
    const replyExists = messages.some((m) => m.id === replyMessage.id && m.replyToMessageId === firstMessage.id);
    const reactionExists = messages.some(
      (m) => m.id === firstMessage.id && (m.reactions ?? []).some((r) => r.emoji === "👍" && (r.userIds ?? []).includes(user2.user.id)),
    );
    if (!replyExists || !reactionExists) {
      throw new Error("Reply/reaction metadata not persisted");
    }

    const deleteReq1 = await post("/messages/delete-requests", {
      chatId: chat.id,
      requestedBy: user1.user.id,
      targetUserId: user2.user.id,
    });
    if (deleteReq1.status !== "PENDING") {
      throw new Error("Delete request was not created as pending");
    }
    const user2DeleteFeed = await get(`/messages/delete-requests/user/${user2.user.id}`);
    const incomingPending = user2DeleteFeed.find((r) => r.id === deleteReq1.id && r.status === "PENDING");
    if (!incomingPending) {
      throw new Error("Target user did not receive pending delete request");
    }

    const rejectedReq = await post(`/messages/delete-requests/${deleteReq1.id}/reject`, { userId: user2.user.id });
    if (rejectedReq.status !== "REJECTED") {
      throw new Error("Delete request reject flow failed");
    }
    const user1AfterReject = await get(`/messages/delete-requests/user/${user1.user.id}`);
    const rejectVisibleToRequester = user1AfterReject.find((r) => r.id === deleteReq1.id && r.status === "REJECTED");
    if (!rejectVisibleToRequester) {
      throw new Error("Requester did not receive rejected delete request state");
    }

    const deleteReq2 = await post("/messages/delete-requests", {
      chatId: chat.id,
      requestedBy: user1.user.id,
      targetUserId: user2.user.id,
    });
    const approvedReq = await post(`/messages/delete-requests/${deleteReq2.id}/approve`, { userId: user2.user.id });
    if (approvedReq.status !== "APPROVED") {
      throw new Error("Delete request approve flow failed");
    }
    const summariesAfterDelete = await get(`/chats/summaries?userId=${user1.user.id}`);
    if (summariesAfterDelete.some((s) => s.chat.id === chat.id)) {
      throw new Error("Chat still present after approved delete request");
    }
    const messagesAfterDelete = await get(`/messages/${chat.id}`);
    if (messagesAfterDelete.length !== 0) {
      throw new Error("Messages still present after approved delete request");
    }
    console.log("Delete request flow verified.");

    console.log("Two-user realtime test passed.");
    console.log(`chatId=${chat.id} messagesBeforeDelete=${messages.length}`);
  } finally {
    if (socket1) socket1.close();
    if (socket2) socket2.close();
    cleanup();
    await delay(500);
  }
}

const hardTimeout = setTimeout(() => {
  console.error("Two-user realtime test failed: timed out");
  process.exit(1);
}, 120000);

runTest()
  .then(() => {
    clearTimeout(hardTimeout);
  })
  .catch((error) => {
    clearTimeout(hardTimeout);
    console.error("Two-user realtime test failed:", error);
    process.exit(1);
  });
