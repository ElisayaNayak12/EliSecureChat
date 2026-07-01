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
  cors: { origin: true, credentials: true },
  namespace: "/chat",
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();

  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  handleConnection(client: Socket) {
    client.emit("connected", { id: client.id });
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;

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
    const existing = this.userSockets.get(body.userId) ?? new Set<string>();
    const wasOnline = existing.size > 0;
    existing.add(client.id);
    this.userSockets.set(body.userId, existing);
    this.socketUsers.set(client.id, body.userId);
    if (!wasOnline) {
      this.server.emit("presence_update", { userId: body.userId, online: true });
    }
    return { ok: true, userId: body.userId };
  }

  @SubscribeMessage("join_chat")
  joinChat(@MessageBody() body: JoinPayload, @ConnectedSocket() client: Socket) {
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
    client.to(body.chatId).emit("typing_update", { chatId: body.chatId, userId: body.userId, isTyping: true });
    return { ok: true };
  }

  @SubscribeMessage("typing_stop")
  typingStop(@MessageBody() body: TypingPayload, @ConnectedSocket() client: Socket) {
    client.to(body.chatId).emit("typing_update", { chatId: body.chatId, userId: body.userId, isTyping: false });
    return { ok: true };
  }

  @SubscribeMessage("mark_read")
  markRead(@MessageBody() body: MarkReadPayload) {
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
  markDelivered(@MessageBody() body: MarkDeliveredPayload) {
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
  sendMessage(@MessageBody() body: SendPayload) {
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
  toggleReaction(@MessageBody() body: ToggleReactionPayload) {
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

  private isUserOnline(userId: string) {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}
