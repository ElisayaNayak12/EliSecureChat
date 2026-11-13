import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { InMemoryStore } from "../store/in-memory.store";
import { Public } from "../auth/decorators";

/** Admin routes use x-admin-token (checked in every handler), not user sessions. */
@Public()
@Controller("admin")
export class AdminController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Get("overview")
  overview(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return {
      users: this.store.users.length,
      activeUsers: this.store.users.filter((u) => (u.status ?? "ACTIVE") === "ACTIVE").length,
      suspendedUsers: this.store.users.filter((u) => u.status === "SUSPENDED").length,
      chats: this.store.chats.length,
      communities: this.store.communities.length,
      messages: this.store.messages.length,
      deleteRequests: this.store.deleteRequests.length,
      pendingRecoveries: this.store.recoveryRequests.filter(
        (r) => r.status === "PENDING_ADMIN" || r.status === "PENDING"
      ).length,
    };
  }

  @Get("users")
  users(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.users.map(({ passwordHash: _passwordHash, ...safeUser }) => safeUser);
  }

  /** Admin hard-delete user (removes all data permanently) */
  @Delete("users/:userId")
  deleteUser(
    @Param("userId") userId: string,
    @Headers("x-admin-token") adminToken?: string,
  ) {
    this.ensureAdmin(adminToken);
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    this.store.deleteUser(userId);
    return { success: true, deletedUserId: userId };
  }

  /** Admin suspend user with a reason (soft-delete) */
  @Post("users/:userId/suspend")
  suspendUser(
    @Param("userId") userId: string,
    @Body() dto: { reason: string },
    @Headers("x-admin-token") adminToken?: string,
  ) {
    this.ensureAdmin(adminToken);
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    const suspended = this.store.suspendUser(
      userId,
      dto.reason || "Suspended by administrator due to policy violation.",
      "admin"
    );
    return { success: suspended, suspendedUserId: userId };
  }

  /** Admin restore (un-suspend) a user */
  @Post("users/:userId/restore")
  restoreUser(
    @Param("userId") userId: string,
    @Headers("x-admin-token") adminToken?: string,
  ) {
    this.ensureAdmin(adminToken);
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    const restored = this.store.restoreUser(userId);
    return { success: restored, restoredUserId: userId };
  }

  @Get("chats")
  chats(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.chats;
  }

  @Get("messages")
  messages(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.messages;
  }

  @Get("communities")
  communities(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.communities;
  }

  @Get("delete-requests")
  deleteRequests(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.deleteRequests;
  }

  /** Get all account recovery requests */
  @Get("recovery-requests")
  getRecoveryRequests(@Headers("x-admin-token") adminToken?: string) {
    this.ensureAdmin(adminToken);
    return this.store.recoveryRequests.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /** Admin approves account recovery — restores user */
  @Post("recovery-requests/:requestId/approve")
  approveRecovery(
    @Param("requestId") requestId: string,
    @Headers("x-admin-token") adminToken?: string,
  ) {
    this.ensureAdmin(adminToken);
    const result = this.store.approveRecovery(requestId);
    if (!result) throw new NotFoundException("RECOVERY_REQUEST_NOT_FOUND");
    return { success: true, recoveryRequest: result };
  }

  /** Admin rejects account recovery */
  @Post("recovery-requests/:requestId/reject")
  rejectRecovery(
    @Param("requestId") requestId: string,
    @Body() dto: { adminNote?: string },
    @Headers("x-admin-token") adminToken?: string,
  ) {
    this.ensureAdmin(adminToken);
    const result = this.store.rejectRecovery(requestId, dto.adminNote);
    if (!result) throw new NotFoundException("RECOVERY_REQUEST_NOT_FOUND");
    return { success: true, recoveryRequest: result };
  }

  private ensureAdmin(adminToken?: string) {
    if (!adminToken || !this.store.isValidAdminSession(adminToken)) {
      throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
    }
  }
}
