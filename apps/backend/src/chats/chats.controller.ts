import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "crypto";
import { InMemoryStore } from "../store/in-memory.store";
import { ChatActionDto } from "./dto/chat-action.dto";
import { CreateChatDto } from "./dto/create-chat.dto";

@Controller("chats")
export class ChatsController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Get("summaries")
  summaries(@Query("userId") userId: string) {
    if (!userId) return [];
    const chats = this.store.chats.filter((c) => c.memberIds.includes(userId));
    return chats
      .map((chat) => {
        const chatMessages = this.store.messages
          .filter((m) => m.chatId === chat.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const lastMessage = chatMessages[0];
        const unreadCount = chatMessages.filter(
          (m) => m.senderId !== userId && !m.readBy.includes(userId),
        ).length;
        const peerId = chat.type === "ONE_TO_ONE" ? chat.memberIds.find((id) => id !== userId) : undefined;
        const peer = peerId
          ? this.store.users.find((u) => u.id === peerId)
          : undefined;
        const peerSafe = peer
          ? {
              id: peer.id,
              name: peer.name,
              phone: peer.phone,
              email: peer.email,
              avatarUrl: peer.avatarUrl,
              lastSeenAt: peer.lastSeenAt,
              createdAt: peer.createdAt,
            }
          : undefined;
        return {
          chat,
          peer: peerSafe,
          lastMessage,
          unreadCount,
          updatedAt: lastMessage?.createdAt ?? chat.createdAt,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  @Get()
  list(@Query("userId") userId: string) {
    if (!userId) return this.store.chats;
    return this.store.chats.filter((c) => c.memberIds.includes(userId));
  }

  @Post()
  create(@Body() dto: CreateChatDto) {
    if (dto.type === "ONE_TO_ONE" && dto.memberIds.length === 2) {
      return this.store.createOneToOneChat(dto.memberIds[0], dto.memberIds[1]);
    }

    const chat = {
      id: randomUUID(),
      type: dto.type,
      title: dto.title,
      memberIds: dto.memberIds,
      createdAt: new Date().toISOString(),
    } as const;
    this.store.chats.push(chat);
    this.store.persist();
    return chat;
  }

  @Post(":chatId/clear-history")
  clearHistory(@Param("chatId") chatId: string, @Body() dto: ChatActionDto) {
    const chat = this.store.chats.find((c) => c.id === chatId);
    if (!chat) {
      throw new BadRequestException("CHAT_NOT_FOUND");
    }
    if (!chat.memberIds.includes(dto.userId)) {
      throw new BadRequestException("USER_NOT_IN_CHAT");
    }

    const before = this.store.messages.length;
    this.store.messages = this.store.messages.filter((m) => m.chatId !== chatId);
    this.store.deleteRequests = this.store.deleteRequests.filter((r) => r.chatId !== chatId);
    this.store.persist();

    return { chatId, clearedMessages: before - this.store.messages.length };
  }

  @Delete(":chatId")
  deleteChat(@Param("chatId") chatId: string, @Query("userId") userId: string) {
    const chat = this.store.chats.find((c) => c.id === chatId);
    if (!chat) {
      throw new BadRequestException("CHAT_NOT_FOUND");
    }
    if (!userId || !chat.memberIds.includes(userId)) {
      throw new BadRequestException("USER_NOT_IN_CHAT");
    }

    this.store.chats = this.store.chats.filter((c) => c.id !== chatId);
    this.store.messages = this.store.messages.filter((m) => m.chatId !== chatId);
    this.store.deleteRequests = this.store.deleteRequests.filter((r) => r.chatId !== chatId);
    this.store.communities = this.store.communities.filter((c) => c.chatId !== chatId);
    this.store.persist();

    return { chatId, deleted: true };
  }
}
