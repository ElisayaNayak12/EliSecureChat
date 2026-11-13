import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { InMemoryStore } from "../store/in-memory.store";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { PreferencesValidationError, applyPreferencesPatch, resolvePreferences } from "./preferences";
import { AllowOtherUser, CurrentUser, Public, type AuthUser } from "../auth/decorators";
import type { User } from "../store/models";

/** What other people may see about a user. Email, preferences and moderation details stay private. */
export function publicProfile(u: User) {
  return { id: u.id, name: u.name, phone: u.phone, avatarUrl: u.avatarUrl, lastSeenAt: u.lastSeenAt, createdAt: u.createdAt, status: u.status ?? "ACTIVE" };
}

@Controller("users")
export class UsersController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Get("search")
  search(@Query("q") q = "", @CurrentUser() me: AuthUser) {
    const needle = q.toLowerCase().trim();
    const users = (!needle ? this.store.users : this.store.users
      .filter((u) => {
        return (
          (u.status ?? "ACTIVE") === "ACTIVE" &&
          (
            u.name.toLowerCase().includes(needle) ||
            u.phone.includes(needle) ||
            (u.email ?? "").toLowerCase().includes(needle)
          )
        );
      })
    )
      .slice(0, 20);

    return users.map((u) => (u.id === me.userId ? this.selfProfile(u) : publicProfile(u)));
  }

  private selfProfile(user: User) {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }

  @AllowOtherUser()
  @Get(":userId")
  getUser(@Param("userId") userId: string, @CurrentUser() me: AuthUser) {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    return user.id === me.userId ? this.selfProfile(user) : publicProfile(user);
  }

  /** Language, accessibility and voice preferences (SignConnect Phase 1a). */
  @Get(":userId/preferences")
  getPreferences(@Param("userId") userId: string) {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundException("USER_NOT_FOUND");
    return resolvePreferences(user.preferences);
  }

  @Patch(":userId/preferences")
  updatePreferences(@Param("userId") userId: string, @Body() body: unknown) {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundException("USER_NOT_FOUND");
    try {
      user.preferences = applyPreferencesPatch(resolvePreferences(user.preferences), body);
    } catch (err) {
      if (err instanceof PreferencesValidationError) {
        throw new BadRequestException({ error: "INVALID_PREFERENCES", issues: err.issues });
      }
      throw err;
    }
    this.store.persist();
    return user.preferences;
  }

  @Patch(":userId")
  updateProfile(@Param("userId") userId: string, @Body() dto: UpdateProfileDto) {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }

    if (dto.email && dto.email !== user.email) {
      const existing = this.store.findUserByEmail(dto.email);
      if (existing && existing.id !== userId) {
        throw new ConflictException("EMAIL_ALREADY_REGISTERED");
      }
    }

    user.name = dto.name?.trim() || user.name;
    user.email = dto.email?.trim() || user.email;
    user.avatarUrl = dto.avatarUrl?.trim() || user.avatarUrl;
    this.store.persist();

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  /* ---------------- blocking ---------------- */

  @Get(":userId/blocks")
  listBlocks(@Param("userId") userId: string) {
    const me = this.store.users.find((u) => u.id === userId);
    if (!me) throw new NotFoundException("USER_NOT_FOUND");
    return (me.blockedUserIds ?? []).map((id) => this.store.users.find((u) => u.id === id)).filter((u): u is User => !!u).map(publicProfile);
  }

  @Post(":userId/blocks")
  @HttpCode(200)
  block(@Param("userId") userId: string, @Body() body: { targetId?: string }) {
    const me = this.store.users.find((u) => u.id === userId);
    if (!me) throw new NotFoundException("USER_NOT_FOUND");
    const target = typeof body?.targetId === "string" ? this.store.users.find((u) => u.id === body.targetId) : undefined;
    if (!target || target.id === me.id) throw new BadRequestException("INVALID_TARGET");
    me.blockedUserIds = [...new Set([...(me.blockedUserIds ?? []), target.id])];
    this.store.persist();
    return { ok: true, blocked: me.blockedUserIds };
  }

  @Delete(":userId/blocks/:targetId")
  unblock(@Param("userId") userId: string, @Param("targetId") targetId: string) {
    const me = this.store.users.find((u) => u.id === userId);
    if (!me) throw new NotFoundException("USER_NOT_FOUND");
    me.blockedUserIds = (me.blockedUserIds ?? []).filter((id) => id !== targetId);
    this.store.persist();
    return { ok: true, blocked: me.blockedUserIds };
  }

  /** Self-delete: suspends account (preserves data for recovery) */
  @Delete(":userId")
  @HttpCode(200)
  deleteAccount(@Param("userId") userId: string) {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }
    const suspended = this.store.suspendUser(
      userId,
      "Account deactivated by user request. Suspended pending review by ELiSecureChat Trust & Safety team.",
      "self"
    );
    return { success: suspended, suspendedUserId: userId };
  }

  /** Submit an account recovery request */
  @Public()
  @Post("recovery-request")
  @HttpCode(201)
  submitRecoveryRequest(
    @Body() dto: { userId: string; reason: string; hasDocument: boolean; hasVideo: boolean }
  ) {
    const user = this.store.users.find((u) => u.id === dto.userId);
    if (!user) {
      throw new NotFoundException("USER_NOT_FOUND");
    }

    // Only suspended users can submit recovery
    if ((user.status ?? "ACTIVE") !== "SUSPENDED") {
      return { error: "Account is not suspended", success: false };
    }

    // Don't create duplicate pending requests
    const existing = this.store.recoveryRequests.find(
      (r) => r.userId === dto.userId && (r.status === "PENDING" || r.status === "AI_PROCESSING" || r.status === "PENDING_ADMIN")
    );
    if (existing) {
      return { success: true, requestId: existing.id, alreadyExists: true };
    }

    const request = this.store.createRecoveryRequest({
      userId: dto.userId,
      reason: dto.reason,
      hasDocument: dto.hasDocument,
      hasVideo: dto.hasVideo,
    });

    // Run AI verification immediately (synchronous simulation)
    const verified = this.store.processAIVerification(request.id);
    return { success: true, requestId: request.id, aiResult: verified?.aiVerification };
  }

  /** Get recovery request status for a user */
  @Public()
  @Get(":userId/recovery-status")
  getRecoveryStatus(@Param("userId") userId: string) {
    const requests = this.store.recoveryRequests
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const latest = requests[0] ?? null;
    return {
      hasRequest: !!latest,
      request: latest
        ? {
            id: latest.id,
            status: latest.status,
            aiVerification: {
              status: latest.aiVerification.status,
              isAuthorized: latest.aiVerification.isAuthorized,
              faceMatchScore: latest.aiVerification.faceMatchScore,
              summary: latest.aiVerification.summary,
            },
            createdAt: latest.createdAt,
          }
        : null,
    };
  }
}
