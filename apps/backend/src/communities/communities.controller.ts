import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { randomUUID } from "crypto";
import { InMemoryStore } from "../store/in-memory.store";
import { CreateCommunityDto } from "./dto/create-community.dto";

@Controller("communities")
export class CommunitiesController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Get()
  list() {
    return this.store.communities;
  }

  @Post()
  create(@Body() dto: CreateCommunityDto) {
    const chatId = randomUUID();
    this.store.chats.push({
      id: chatId,
      type: "COMMUNITY",
      title: dto.name,
      memberIds: [dto.ownerId],
      createdAt: new Date().toISOString(),
    });

    const community = {
      id: randomUUID(),
      chatId,
      ownerId: dto.ownerId,
      name: dto.name,
      description: dto.description,
      privacy: dto.privacy ?? "PUBLIC",
      inviteCode: randomUUID().slice(0, 8),
      createdAt: new Date().toISOString(),
    };
    this.store.communities.push(community);
    this.store.persist();
    return community;
  }
}
