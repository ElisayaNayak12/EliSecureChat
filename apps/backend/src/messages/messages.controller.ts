import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { randomUUID } from "crypto";
import { InMemoryStore } from "../store/in-memory.store";
import { CreateDeleteRequestDto } from "./dto/create-delete-request.dto";
import { EditMessageDto } from "./dto/edit-message.dto";
import { MarkReadDto } from "./dto/mark-read.dto";
import { PinMessageDto } from "./dto/pin-message.dto";
import { ResolveDeleteRequestDto } from "./dto/resolve-delete-request.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { ToggleReactionDto } from "./dto/toggle-reaction.dto";

@Controller("messages")
export class MessagesController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Get("delete-requests/chat/:chatId")
  listDeleteRequests(@Param("chatId") chatId: string) {
    return this.store.deleteRequests
      .filter((r) => r.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  @Get("delete-requests/user/:userId")
  listDeleteRequestsForUser(@Param("userId") userId: string) {
    return this.store.deleteRequests
      .filter((r) => r.requestedBy === userId || r.targetUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  @Get(":chatId")
  byChat(@Param("chatId") chatId: string) {
    return this.store.messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  @Post()
  create(@Body() dto: SendMessageDto) {
    const message = {
      id: randomUUID(),
      chatId: dto.chatId,
      senderId: dto.senderId,
      encryptedContent: dto.encryptedContent,
      nonce: dto.nonce,
      messageType: dto.messageType ?? "TEXT",
      replyToMessageId: dto.replyToMessageId,
      attachmentUrl: dto.attachmentUrl,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      reactions: [],
      isEdited: false,
      createdAt: new Date().toISOString(),
      readBy: [dto.senderId],
      deliveredTo: [dto.senderId],
    };
    this.store.messages.push(message);
    this.store.persist();
    return message;
  }

  @Patch(":messageId")
  edit(@Param("messageId") messageId: string, @Body() dto: EditMessageDto) {
    const message = this.store.messages.find((m) => m.id === messageId);
    if (!message) {
      return { error: "MESSAGE_NOT_FOUND" };
    }

    message.encryptedContent = dto.encryptedContent;
    message.isEdited = true;
    message.editedAt = new Date().toISOString();
    this.store.persist();
    return message;
  }

  @Post("delete-requests")
  createDeleteRequest(@Body() dto: CreateDeleteRequestDto) {
    const chat = this.store.chats.find((c) => c.id === dto.chatId);
    if (!chat) {
      throw new BadRequestException("CHAT_NOT_FOUND");
    }
    if (!chat.memberIds.includes(dto.requestedBy)) {
      throw new BadRequestException("REQUESTER_NOT_IN_CHAT");
    }
    const resolvedTargetUserId =
      dto.targetUserId ??
      (chat.type === "ONE_TO_ONE" ? chat.memberIds.find((id) => id !== dto.requestedBy) : undefined);
    if (!resolvedTargetUserId) {
      throw new BadRequestException("TARGET_USER_REQUIRED");
    }
    if (!chat.memberIds.includes(resolvedTargetUserId)) {
      throw new BadRequestException("TARGET_NOT_IN_CHAT");
    }
    if (resolvedTargetUserId === dto.requestedBy) {
      throw new BadRequestException("TARGET_MUST_BE_OTHER_MEMBER");
    }
    const existingPending = this.store.deleteRequests.find(
      (r) => r.chatId === dto.chatId && r.status === "PENDING",
    );
    if (existingPending) {
      throw new BadRequestException("DELETE_REQUEST_ALREADY_PENDING");
    }

    const req = {
      id: randomUUID(),
      chatId: dto.chatId,
      requestedBy: dto.requestedBy,
      targetUserId: resolvedTargetUserId,
      status: "PENDING" as const,
      createdAt: new Date().toISOString(),
    };
    this.store.deleteRequests.push(req);
    this.store.persist();
    return req;
  }

  @Post("delete-requests/:requestId/approve")
  approveDeleteRequest(@Param("requestId") requestId: string, @Body() dto: ResolveDeleteRequestDto) {
    const req = this.store.deleteRequests.find((r) => r.id === requestId);
    if (!req) {
      throw new BadRequestException("REQUEST_NOT_FOUND");
    }
    if (req.status !== "PENDING") {
      throw new BadRequestException("REQUEST_ALREADY_RESOLVED");
    }
    if (req.targetUserId && req.targetUserId !== dto.userId) {
      throw new BadRequestException("ONLY_TARGET_CAN_APPROVE");
    }

    req.status = "APPROVED";
    req.approvedAt = new Date().toISOString();
    this.deleteChatData(req.chatId);
    this.store.deleteRequests = this.store.deleteRequests.filter((r) => r.id === req.id || r.chatId !== req.chatId);
    this.store.persist();
    return req;
  }

  @Post("delete-requests/:requestId/reject")
  rejectDeleteRequest(@Param("requestId") requestId: string, @Body() dto: ResolveDeleteRequestDto) {
    const req = this.store.deleteRequests.find((r) => r.id === requestId);
    if (!req) {
      throw new BadRequestException("REQUEST_NOT_FOUND");
    }
    if (req.status !== "PENDING") {
      throw new BadRequestException("REQUEST_ALREADY_RESOLVED");
    }
    if (req.targetUserId && req.targetUserId !== dto.userId) {
      throw new BadRequestException("ONLY_TARGET_CAN_REJECT");
    }

    req.status = "REJECTED";
    req.rejectedAt = new Date().toISOString();
    this.store.persist();
    return req;
  }

  @Post(":chatId/read")
  markRead(@Param("chatId") chatId: string, @Body() dto: MarkReadDto) {
    const updatedIds: string[] = [];
    for (const message of this.store.messages) {
      if (message.chatId !== chatId) continue;
      if (message.senderId === dto.userId) continue;
      if (dto.messageIds && !dto.messageIds.includes(message.id)) continue;
      if (!message.readBy.includes(dto.userId)) {
        message.readBy.push(dto.userId);
        updatedIds.push(message.id);
      }
    }
    if (updatedIds.length > 0) {
      this.store.persist();
    }
    return { chatId, userId: dto.userId, messageIds: updatedIds };
  }

  @Post(":messageId/reactions/toggle")
  toggleReaction(@Param("messageId") messageId: string, @Body() dto: ToggleReactionDto) {
    const message = this.store.messages.find((m) => m.id === messageId);
    if (!message) {
      return { error: "MESSAGE_NOT_FOUND" };
    }

    const normalizedEmoji = dto.emoji.trim();
    if (!normalizedEmoji) {
      return { error: "EMOJI_REQUIRED" };
    }

    const reaction = message.reactions.find((r) => r.emoji === normalizedEmoji);
    if (!reaction) {
      message.reactions.push({ emoji: normalizedEmoji, userIds: [dto.userId] });
    } else if (reaction.userIds.includes(dto.userId)) {
      reaction.userIds = reaction.userIds.filter((id) => id !== dto.userId);
      if (reaction.userIds.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== normalizedEmoji);
      }
    } else {
      reaction.userIds.push(dto.userId);
    }
    this.store.persist();
    return { messageId: message.id, reactions: message.reactions };
  }

  @Post(":messageId/pin")
  pinMessage(@Param("messageId") messageId: string, @Body() dto: PinMessageDto) {
    const message = this.store.messages.find((m) => m.id === messageId);
    if (!message) {
      return { error: "MESSAGE_NOT_FOUND" };
    }
    const chat = this.store.chats.find((c) => c.id === message.chatId);
    if (!chat) {
      return { error: "CHAT_NOT_FOUND" };
    }

    chat.pinnedMessageId = message.id;
    chat.pinnedBy = dto.userId;
    chat.pinnedAt = new Date().toISOString();
    this.store.persist();
    return {
      chatId: chat.id,
      pinnedMessageId: chat.pinnedMessageId,
      pinnedBy: chat.pinnedBy,
      pinnedAt: chat.pinnedAt,
    };
  }

  @Post(":chatId/unpin")
  unpinMessage(@Param("chatId") chatId: string, @Body() dto: PinMessageDto) {
    const chat = this.store.chats.find((c) => c.id === chatId);
    if (!chat) {
      return { error: "CHAT_NOT_FOUND" };
    }
    chat.pinnedMessageId = undefined;
    chat.pinnedBy = dto.userId;
    chat.pinnedAt = new Date().toISOString();
    this.store.persist();
    return {
      chatId: chat.id,
      pinnedMessageId: chat.pinnedMessageId,
      pinnedBy: chat.pinnedBy,
      pinnedAt: chat.pinnedAt,
    };
  }

  private deleteChatData(chatId: string) {
    this.store.chats = this.store.chats.filter((c) => c.id !== chatId);
    this.store.messages = this.store.messages.filter((m) => m.chatId !== chatId);
    this.store.communities = this.store.communities.filter((c) => c.chatId !== chatId);
    this.store.deleteRequests = this.store.deleteRequests.filter((r) => r.chatId !== chatId);
  }
}
