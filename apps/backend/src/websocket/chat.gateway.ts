import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { randomUUID } from "crypto";
import type { Server, Socket } from "socket.io";
import { InMemoryStore } from "../store/in-memory.store";
import { AuthService } from "../auth/auth.service";
import { allowedOrigins } from "../app-setup";
import type { CallMedia, CallRecord } from "../store/models";
import { parseProfile, parseSignal, parseTranslation } from "./call-payloads";

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS ?? 45_000);

type JoinPayload = { chatId: string };
type SendPayload = {
  chatId: string;
  senderId: string;
  encryptedContent: string;
  nonce?: string;
  messageType?: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "SYSTEM";
  replyToMessageId?: string;
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};
type PresencePayload = { userId: string };
type TypingPayload = { chatId: string; userId: string };
type MarkReadPayload = { chatId: string; userId: string; messageIds?: string[] };
type MarkDeliveredPayload = { chatId: string; userId: string; messageIds?: string[] };
type ToggleReactionPayload = { messageId: string; userId: string; emoji: string };

@WebSocketGateway({
  cors: { origin: allowedOrigins(), credentials: true },
  namespace: "/chat",
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();

  constructor(
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** Every socket must present a valid access token (socket.auth.token); the user comes from it, never from payloads. */
  handleConnection(client: Socket) {
    const token = typeof client.handshake.auth?.token === "string" ? client.handshake.auth.token : "";
    const me = token ? this.auth.authenticate(token) : null;
    if (!me) {
      client.emit("auth_error", { error: "INVALID_OR_EXPIRED_TOKEN" });
      client.disconnect(true);
      return;
    }
    client.data.userId = me.userId;
    client.data.sessionId = me.sessionId;
    this.attach(client, me.userId);
    client.emit("connected", { id: client.id, userId: me.userId });
  }

  private attach(client: Socket, userId: string) {
    const existing = this.userSockets.get(userId) ?? new Set<string>();
    const wasOnline = existing.size > 0;
    existing.add(client.id);
    this.userSockets.set(userId, existing);
    this.socketUsers.set(client.id, userId);
    if (!wasOnline) this.server.emit("presence_update", { userId, online: true });
  }

  /**
   * Object-level authorisation for socket events: acting-user fields must be the socket's user, and any chat or
   * message referenced must be in one of the user's chats. Returns an error ack instead of throwing.
   */
  private deny(client: Socket, body: unknown): { ok: false; error: string } | null {
    const me = client.data?.userId as string | undefined;
    if (!me) return { ok: false, error: "NOT_AUTHENTICATED" };
    if (typeof body !== "object" || body === null) return { ok: false, error: "INVALID_PAYLOAD" };
    const b = body as Record<string, unknown>;
    for (const f of ["userId", "senderId"]) {
      if (b[f] !== undefined && b[f] !== me) return { ok: false, error: "NOT_YOUR_ACCOUNT" };
    }
    const member = (chatId: string) => this.store.chats.some((c) => c.id === chatId && c.memberIds.includes(me));
    if (b.chatId !== undefined && (typeof b.chatId !== "string" || !member(b.chatId))) return { ok: false, error: "NOT_A_CHAT_MEMBER" };
    if (typeof b.messageId === "string") {
      const msg = this.store.messages.find((m) => m.id === b.messageId);
      if (msg && !member(msg.chatId)) return { ok: false, error: "NOT_A_CHAT_MEMBER" };
    }
    return null;
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;
    // End any live call once the user has no sockets left (checked after the bookkeeping below).
    queueMicrotask(() => {
      if (!this.isUserOnline(userId)) this.endCallsFor(userId, "DISCONNECTED");
    });

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketUsers.delete(client.id);

    if (!this.isUserOnline(userId)) {
      const user = this.store.users.find((u) => u.id === userId);
      if (user) {
        user.lastSeenAt = new Date().toISOString();
        this.store.persist();
      }
      this.server.emit("presence_update", {
        userId,
        online: false,
        lastSeenAt: user?.lastSeenAt,
      });
    }
  }

  @SubscribeMessage("register_presence")
  registerPresence(@MessageBody() body: PresencePayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body ?? {});
    if (denied) return denied;
    const me = client.data.userId as string;
    this.attach(client, me);
    return { ok: true, userId: me };
  }

  @SubscribeMessage("join_chat")
  joinChat(@MessageBody() body: JoinPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    client.join(body.chatId);

    const userId = this.socketUsers.get(client.id);
    if (userId) {
      const deliveredIds: string[] = [];
      for (const message of this.store.messages) {
        if (message.chatId !== body.chatId) continue;
        if (message.senderId === userId) continue;
        if (!message.deliveredTo.includes(userId)) {
          message.deliveredTo.push(userId);
          deliveredIds.push(message.id);
        }
      }
      if (deliveredIds.length > 0) {
        this.store.persist();
        this.server.to(body.chatId).emit("messages_delivered", {
          chatId: body.chatId,
          userId,
          messageIds: deliveredIds,
        });
      }
    }

    const chat = this.store.chats.find((c) => c.id === body.chatId);
    const onlineUserIds = (chat?.memberIds ?? []).filter((id) => this.isUserOnline(id));
    this.server.to(body.chatId).emit("chat_presence", { chatId: body.chatId, onlineUserIds });

    client.emit("joined_chat", { chatId: body.chatId });
    return { ok: true, chatId: body.chatId };
  }

  @SubscribeMessage("typing_start")
  typingStart(@MessageBody() body: TypingPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    client.to(body.chatId).emit("typing_update", { chatId: body.chatId, userId: body.userId, isTyping: true });
    return { ok: true };
  }

  @SubscribeMessage("typing_stop")
  typingStop(@MessageBody() body: TypingPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    client.to(body.chatId).emit("typing_update", { chatId: body.chatId, userId: body.userId, isTyping: false });
    return { ok: true };
  }

  @SubscribeMessage("mark_read")
  markRead(@MessageBody() body: MarkReadPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    const updatedIds: string[] = [];
    for (const message of this.store.messages) {
      if (message.chatId !== body.chatId) continue;
      if (message.senderId === body.userId) continue;
      if (body.messageIds && !body.messageIds.includes(message.id)) continue;
      if (!message.readBy.includes(body.userId)) {
        message.readBy.push(body.userId);
        updatedIds.push(message.id);
      }
    }

    if (updatedIds.length > 0) {
      this.store.persist();
      this.server.to(body.chatId).emit("messages_read", {
        chatId: body.chatId,
        userId: body.userId,
        messageIds: updatedIds,
      });
    }
    return { ok: true, messageIds: updatedIds };
  }

  @SubscribeMessage("ack_delivered")
  markDelivered(@MessageBody() body: MarkDeliveredPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    const updatedIds: string[] = [];
    for (const message of this.store.messages) {
      if (message.chatId !== body.chatId) continue;
      if (message.senderId === body.userId) continue;
      if (body.messageIds && !body.messageIds.includes(message.id)) continue;
      if (!message.deliveredTo.includes(body.userId)) {
        message.deliveredTo.push(body.userId);
        updatedIds.push(message.id);
      }
    }

    if (updatedIds.length > 0) {
      this.store.persist();
      this.server.to(body.chatId).emit("messages_delivered", {
        chatId: body.chatId,
        userId: body.userId,
        messageIds: updatedIds,
      });
    }
    return { ok: true, messageIds: updatedIds };
  }

  @SubscribeMessage("send_message")
  sendMessage(@MessageBody() body: SendPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    if (typeof body.encryptedContent !== "string" || body.encryptedContent.length === 0 || body.encryptedContent.length > 65536) {
      return { ok: false, error: "INVALID_CONTENT" };
    }
    if (this.store.isChatBlocked(body.chatId, body.senderId)) return { ok: false, error: "BLOCKED" };
    const chat = this.store.chats.find((c) => c.id === body.chatId);
    const onlineRecipients = (chat?.memberIds ?? [])
      .filter((id) => id !== body.senderId)
      .filter((id) => this.isUserOnline(id));
    const message = {
      id: randomUUID(),
      chatId: body.chatId,
      senderId: body.senderId,
      encryptedContent: body.encryptedContent,
      nonce: body.nonce,
      messageType: body.messageType ?? "TEXT",
      replyToMessageId: body.replyToMessageId,
      attachmentUrl: body.attachmentUrl,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      reactions: [],
      isEdited: false,
      createdAt: new Date().toISOString(),
      readBy: [body.senderId],
      deliveredTo: [body.senderId, ...onlineRecipients],
    };
    this.store.messages.push(message);
    this.store.persist();
    this.server.to(body.chatId).emit("receive_message", message);
    for (const recipientId of onlineRecipients) {
      this.server.to(body.chatId).emit("messages_delivered", {
        chatId: body.chatId,
        userId: recipientId,
        messageIds: [message.id],
      });
    }
    return message;
  }

  @SubscribeMessage("toggle_reaction")
  toggleReaction(@MessageBody() body: ToggleReactionPayload, @ConnectedSocket() client: Socket) {
    const denied = this.deny(client, body);
    if (denied) return denied;
    const message = this.store.messages.find((m) => m.id === body.messageId);
    if (!message) {
      return { error: "MESSAGE_NOT_FOUND" };
    }
    const emoji = body.emoji.trim();
    if (!emoji) {
      return { error: "EMOJI_REQUIRED" };
    }

    const existing = message.reactions.find((r) => r.emoji === emoji);
    if (!existing) {
      message.reactions.push({ emoji, userIds: [body.userId] });
    } else if (existing.userIds.includes(body.userId)) {
      existing.userIds = existing.userIds.filter((id) => id !== body.userId);
      if (existing.userIds.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      }
    } else {
      existing.userIds.push(body.userId);
    }
    this.store.persist();
    this.server.to(message.chatId).emit("reaction_update", {
      messageId: message.id,
      chatId: message.chatId,
      reactions: message.reactions,
    });
    return { messageId: message.id, reactions: message.reactions };
  }

  /* ===================== SignConnect: WebRTC call signalling ===================== */

  private readonly liveCalls = new Map<string, CallRecord>();
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();

  /** The acting user is derived from the registered socket, never trusted from the payload. */
  private socketUser(client: Socket) {
    return (client.data?.userId as string | undefined) ?? this.socketUsers.get(client.id) ?? null;
  }

  private emitToUser(userId: string, event: string, payload: unknown) {
    for (const sid of this.userSockets.get(userId) ?? []) this.server.to(sid).emit(event, payload);
  }

  private userInLiveCall(userId: string) {
    return [...this.liveCalls.values()].some((c) => c.participantIds.includes(userId));
  }

  private finishCall(call: CallRecord, status: CallRecord["status"], reason: string) {
    const timer = this.ringTimers.get(call.id);
    if (timer) clearTimeout(timer);
    this.ringTimers.delete(call.id);
    this.liveCalls.delete(call.id);
    call.status = status;
    call.endedAt = new Date().toISOString();
    this.store.persist();
    for (const uid of call.participantIds) this.emitToUser(uid, "call:ended", { callId: call.id, status, reason });
  }

  private endCallsFor(userId: string, reason: string) {
    for (const call of [...this.liveCalls.values()]) {
      if (call.participantIds.includes(userId)) this.finishCall(call, call.status === "RINGING" ? "MISSED" : "ENDED", reason);
    }
  }

  private liveCallFor(callId: unknown, userId: string) {
    if (typeof callId !== "string") return null;
    const call = this.liveCalls.get(callId);
    return call && call.participantIds.includes(userId) ? call : null;
  }

  @SubscribeMessage("call:invite")
  callInvite(@MessageBody() body: { chatId?: string; media?: string }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    if (!userId) return { ok: false, error: "NOT_REGISTERED" };
    const chat = this.store.chats.find((c) => c.id === body?.chatId);
    if (!chat || !chat.memberIds.includes(userId)) return { ok: false, error: "CHAT_NOT_FOUND" };
    if (chat.type !== "ONE_TO_ONE") return { ok: false, error: "GROUP_CALLS_NOT_SUPPORTED" };
    const media: CallMedia = body?.media === "AUDIO" ? "AUDIO" : "VIDEO";
    const peerId = chat.memberIds.find((id) => id !== userId);
    if (!peerId) return { ok: false, error: "NO_PEER" };
    if (this.store.isBlockedBetween(userId, peerId)) return { ok: false, error: "BLOCKED" };

    const call: CallRecord = {
      id: randomUUID(),
      chatId: chat.id,
      initiatedBy: userId,
      participantIds: [userId, peerId],
      media,
      status: "RINGING",
      startedAt: new Date().toISOString(),
    };
    this.store.calls.push(call);

    if (this.userInLiveCall(userId) || this.userInLiveCall(peerId)) {
      call.status = "FAILED";
      call.endedAt = call.startedAt;
      this.store.persist();
      return { ok: false, error: "BUSY" };
    }
    if (!this.isUserOnline(peerId)) {
      call.status = "MISSED";
      call.endedAt = call.startedAt;
      this.store.persist();
      return { ok: false, error: "PEER_OFFLINE" };
    }

    this.liveCalls.set(call.id, call);
    this.store.persist();
    const caller = this.store.users.find((u) => u.id === userId);
    this.emitToUser(peerId, "call:incoming", {
      callId: call.id,
      chatId: chat.id,
      media,
      from: { id: userId, name: caller?.name ?? "Unknown", avatarUrl: caller?.avatarUrl },
    });
    this.ringTimers.set(
      call.id,
      setTimeout(() => {
        const live = this.liveCalls.get(call.id);
        if (live && live.status === "RINGING") this.finishCall(live, "MISSED", "NO_ANSWER");
      }, RING_TIMEOUT_MS),
    );
    return { ok: true, callId: call.id, peerId };
  }

  @SubscribeMessage("call:accept")
  callAccept(@MessageBody() body: { callId?: string }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!userId || !call) return { ok: false, error: "CALL_NOT_FOUND" };
    if (call.initiatedBy === userId || call.status !== "RINGING") return { ok: false, error: "INVALID_STATE" };
    const timer = this.ringTimers.get(call.id);
    if (timer) clearTimeout(timer);
    this.ringTimers.delete(call.id);
    call.status = "ACTIVE";
    call.answeredAt = new Date().toISOString();
    this.store.persist();
    this.emitToUser(call.initiatedBy, "call:accepted", { callId: call.id });
    // Stop ringing on the callee's other devices.
    for (const sid of this.userSockets.get(userId) ?? []) {
      if (sid !== client.id) this.server.to(sid).emit("call:ended", { callId: call.id, status: "ACTIVE", reason: "ANSWERED_ELSEWHERE" });
    }
    return { ok: true };
  }

  @SubscribeMessage("call:decline")
  callDecline(@MessageBody() body: { callId?: string }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!call) return { ok: false, error: "CALL_NOT_FOUND" };
    this.finishCall(call, "DECLINED", "DECLINED");
    return { ok: true };
  }

  @SubscribeMessage("call:end")
  callEnd(@MessageBody() body: { callId?: string }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!call) return { ok: false, error: "CALL_NOT_FOUND" };
    const ringing = call.status === "RINGING";
    this.finishCall(call, ringing ? "MISSED" : "ENDED", ringing ? "CANCELLED" : "HANGUP");
    return { ok: true };
  }

  /** Relays SDP offers/answers and ICE candidates to the other participant. */
  @SubscribeMessage("call:signal")
  callSignal(@MessageBody() body: { callId?: string; data?: unknown }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!userId || !call) return { ok: false, error: "CALL_NOT_FOUND" };
    if (call.status !== "ACTIVE") return { ok: false, error: "CALL_NOT_ACTIVE" };
    const data = parseSignal(body?.data);
    if (!data) return { ok: false, error: "INVALID_SIGNAL" };
    const peerId = call.participantIds.find((id) => id !== userId)!;
    this.emitToUser(peerId, "call:signal", { callId: call.id, from: userId, data });
    return { ok: true };
  }

  /** Relays captions / sign translations produced ON THE SENDER DEVICE. The server never receives media. */
  @SubscribeMessage("call:translation")
  callTranslation(@MessageBody() body: { callId?: string; payload?: unknown }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!userId || !call || call.status !== "ACTIVE") return { ok: false, error: "CALL_NOT_ACTIVE" };
    const payload = parseTranslation(body?.payload);
    if (!payload) return { ok: false, error: "INVALID_TRANSLATION" };
    if (!call.aiAssistUsed) {
      call.aiAssistUsed = true;
      this.store.persist();
    }
    const peerId = call.participantIds.find((id) => id !== userId)!;
    this.emitToUser(peerId, "call:translation", { callId: call.id, from: userId, payload, at: new Date().toISOString() });
    return { ok: true };
  }

  /** Shares this participant's sign language with the other side, so each can show the right signs and previews. */
  @SubscribeMessage("call:profile")
  callProfile(@MessageBody() body: { callId?: string; profile?: unknown }, @ConnectedSocket() client: Socket) {
    const userId = this.socketUser(client);
    const call = userId ? this.liveCallFor(body?.callId, userId) : null;
    if (!userId || !call || call.status !== "ACTIVE") return { ok: false, error: "CALL_NOT_ACTIVE" };
    const profile = parseProfile(body?.profile);
    if (!profile) return { ok: false, error: "INVALID_PROFILE" };
    const peerId = call.participantIds.find((id) => id !== userId)!;
    this.emitToUser(peerId, "call:profile", { callId: call.id, from: userId, profile });
    return { ok: true };
  }

  private isUserOnline(userId: string) {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}
