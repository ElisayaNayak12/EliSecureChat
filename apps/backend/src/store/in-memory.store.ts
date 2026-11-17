import { Injectable, OnModuleInit } from "@nestjs/common";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { v4 as uuidv4 } from "uuid";
import { AdminSession, AIVerificationResult, CallRecord, DeviceKeyRecord, DeviceSession, PasswordResetCode, PendingRegistration, UploadRecord, Chat, Community, DatasetConsent, DatasetSample, DeleteRequest, Message, RecoveryRequest, SignModel, SignVideo, User, VocabularyEntry } from "./models";
import { canonicalPhone } from "../auth/contact";

@Injectable()
export class InMemoryStore implements OnModuleInit {
  users: User[] = [];
  chats: Chat[] = [];
  messages: Message[] = [];
  deleteRequests: DeleteRequest[] = [];
  communities: Community[] = [];
  recoveryRequests: RecoveryRequest[] = [];
  adminSessions: AdminSession[] = [];
  sessions: DeviceSession[] = [];
  uploads: UploadRecord[] = [];
  passwordResets: PasswordResetCode[] = [];
  pendingRegistrations: PendingRegistration[] = [];
  deviceKeys: DeviceKeyRecord[] = [];
  calls: CallRecord[] = [];
  signVideos: SignVideo[] = [];
  vocabulary: VocabularyEntry[] = [];
  datasetConsents: DatasetConsent[] = [];
  datasetSamples: DatasetSample[] = [];
  signModels: SignModel[] = [];
  readonly adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  readonly adminPasswordHash = this.hashPassword(process.env.ADMIN_PASSWORD ?? "admin123");
  readonly storeFilePath = (() => {
    if (process.env.STORE_FILE) {
      return resolve(process.cwd(), process.env.STORE_FILE);
    }
    const cwd = process.cwd();
    if (cwd.endsWith("apps/backend") || cwd.endsWith("apps\\backend")) {
      return resolve(cwd, "data/store.json");
    }
    return resolve(cwd, "apps/backend/data/store.json");
  })();

  onModuleInit() {
    this.load();
  }

  /** Matches any way of writing the number (+91 98765 43210, 9876543210, ...) against old and new accounts. */
  findUserByPhone(phone: string) {
    const exact = this.users.find((u) => u.phone === phone);
    if (exact) return exact;
    const key = canonicalPhone(phone);
    return key ? this.users.find((u) => canonicalPhone(u.phone) === key) : undefined;
  }

  findUserByEmail(email: string) {
    return this.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  }

  findActiveUserByPhone(phone: string) {
    return this.users.find((u) => u.phone === phone && (u.status ?? "ACTIVE") === "ACTIVE");
  }

  createUser(data: Omit<User, "id" | "createdAt">): User {
    const now = new Date().toISOString();
    const user: User = {
      id: uuidv4(),
      createdAt: now,
      lastSeenAt: now,
      status: "ACTIVE",
      ...data,
    };
    this.users.push(user);
    this.persist();
    return user;
  }

  createOneToOneChat(userA: string, userB: string): Chat {
    const existing = this.chats.find(
      (c) =>
        c.type === "ONE_TO_ONE" &&
        c.memberIds.length === 2 &&
        c.memberIds.includes(userA) &&
        c.memberIds.includes(userB),
    );
    if (existing) return existing;
    const chat: Chat = {
      id: uuidv4(),
      type: "ONE_TO_ONE",
      memberIds: [userA, userB],
      createdAt: new Date().toISOString(),
    };
    this.chats.push(chat);
    this.persist();
    return chat;
  }

  hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, passwordHash: string) {
    const [salt, storedHash] = passwordHash.split(":");
    if (!salt || !storedHash) return false;
    const hashBuffer = scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (storedBuffer.length !== hashBuffer.length) return false;
    return timingSafeEqual(storedBuffer, hashBuffer);
  }

  /** In production the admin console is disabled unless ADMIN_PASSWORD (12+ characters) is configured. */
  get adminLoginEnabled() {
    if (process.env.NODE_ENV !== "production") return true;
    return (process.env.ADMIN_PASSWORD ?? "").length >= 12;
  }

  verifyAdminCredentials(username: string, password: string) {
    if (!this.adminLoginEnabled) return false;
    if (username !== this.adminUsername) return false;
    return this.verifyPassword(password, this.adminPasswordHash);
  }

  /** Admin sessions: random token, only its hash stored, expires after ADMIN_SESSION_HOURS (default 8). */
  createAdminSession() {
    const token = `admin_${randomBytes(32).toString("base64url")}`;
    const now = Date.now();
    const hours = Number(process.env.ADMIN_SESSION_HOURS ?? 8);
    this.adminSessions = this.adminSessions.filter((s) => Date.parse(s.expiresAt) > now).slice(-19);
    this.adminSessions.push({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + hours * 3600_000).toISOString(),
    });
    this.persist();
    return token;
  }

  /** True if either user has blocked the other. */
  isBlockedBetween(a: string, b: string) {
    const ua = this.users.find((u) => u.id === a);
    const ub = this.users.find((u) => u.id === b);
    return !!(ua?.blockedUserIds?.includes(b) || ub?.blockedUserIds?.includes(a));
  }

  /** For 1:1 chats: is messaging/calling between the members blocked? Groups are not affected. */
  isChatBlocked(chatId: string, senderId: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    if (!chat || chat.type !== "ONE_TO_ONE") return false;
    const other = chat.memberIds.find((id) => id !== senderId);
    return !!other && this.isBlockedBetween(senderId, other);
  }

  isValidAdminSession(token: string) {
    if (typeof token !== "string" || !token.startsWith("admin_")) return false;
    const hash = createHash("sha256").update(token).digest("hex");
    return this.adminSessions.some((s) => s.tokenHash === hash && Date.parse(s.expiresAt) > Date.now());
  }

  revokeAdminSession(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    this.adminSessions = this.adminSessions.filter((s) => s.tokenHash !== hash);
    this.persist();
  }

  /** Soft-suspend a user (keeps all data). Returns false if user not found. */
  suspendUser(userId: string, reason: string, suspendedBy: "self" | "admin"): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;
    user.status = "SUSPENDED";
    user.suspensionReason = reason;
    user.suspendedAt = new Date().toISOString();
    user.suspendedBy = suspendedBy;
    this.persist();
    return true;
  }

  /** Restore a suspended user to ACTIVE. */
  restoreUser(userId: string): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;
    user.status = "ACTIVE";
    user.suspensionReason = undefined;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    this.persist();
    return true;
  }

  /** Hard-delete a user and all their data (admin override only). */
  deleteUser(userId: string): void {
    this.users = this.users.filter((u) => u.id !== userId);

    const chatsToDelete = this.chats.filter(
      (c) =>
        (c.type === "ONE_TO_ONE" && c.memberIds.includes(userId)) ||
        (c.type === "COMMUNITY" && this.communities.some((comm) => comm.chatId === c.id && comm.ownerId === userId))
    );
    const chatIdsToDelete = new Set(chatsToDelete.map((c) => c.id));

    this.chats = this.chats.filter((c) => !chatIdsToDelete.has(c.id));
    this.communities = this.communities.filter((comm) => comm.ownerId !== userId);
    this.chats.forEach((c) => {
      if (c.memberIds.includes(userId)) {
        c.memberIds = c.memberIds.filter((id) => id !== userId);
      }
    });

    this.messages = this.messages.filter(
      (m) => m.senderId !== userId && !chatIdsToDelete.has(m.chatId)
    );
    this.messages.forEach((m) => {
      m.readBy = m.readBy.filter((id) => id !== userId);
      m.deliveredTo = m.deliveredTo.filter((id) => id !== userId);
    });

    this.deleteRequests = this.deleteRequests.filter(
      (r) => r.requestedBy !== userId && r.targetUserId !== userId && !chatIdsToDelete.has(r.chatId)
    );

    // Remove their recovery requests too
    this.recoveryRequests = this.recoveryRequests.filter((r) => r.userId !== userId);

    this.persist();
  }

  /** Create a recovery request for a suspended user */
  createRecoveryRequest(data: {
    userId: string;
    reason: string;
    hasDocument: boolean;
    hasVideo: boolean;
  }): RecoveryRequest {
    const user = this.users.find((u) => u.id === data.userId);
    const request: RecoveryRequest = {
      id: uuidv4(),
      userId: data.userId,
      userName: user?.name ?? "Unknown",
      phone: user?.phone ?? "",
      email: user?.email,
      reason: data.reason,
      hasDocument: data.hasDocument,
      hasVideo: data.hasVideo,
      aiVerification: { status: "PENDING" },
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    this.recoveryRequests.push(request);
    this.persist();
    return request;
  }

  /** Simulate AI verification for a recovery request */
  /**
   * Account recovery goes to a human admin. There is NO automatic identity verification: the earlier version
   * produced random "face match" scores, which must never be shown as real (spec section 13).
   */
  processAIVerification(requestId: string): RecoveryRequest | null {
    const req = this.recoveryRequests.find((r) => r.id === requestId);
    if (!req) return null;
    req.aiVerification = {
      status: "NOT_AVAILABLE",
      summary: "Automatic identity verification is not available. An admin must verify this person manually (for example by video call or official document check).",
    };
    req.status = "PENDING_ADMIN";
    this.persist();
    return req;
  }


  /** Admin approves recovery request — restores user account */
  approveRecovery(requestId: string): RecoveryRequest | null {
    const req = this.recoveryRequests.find((r) => r.id === requestId);
    if (!req) return null;
    req.status = "APPROVED";
    req.resolvedAt = new Date().toISOString();
    this.restoreUser(req.userId);
    this.persist();
    return req;
  }

  /** Admin rejects recovery request */
  rejectRecovery(requestId: string, adminNote?: string): RecoveryRequest | null {
    const req = this.recoveryRequests.find((r) => r.id === requestId);
    if (!req) return null;
    req.status = "REJECTED";
    req.resolvedAt = new Date().toISOString();
    if (adminNote) req.adminNote = adminNote;
    this.persist();
    return req;
  }

  persist() {
    const dir = dirname(this.storeFilePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload = {
      users: this.users,
      chats: this.chats,
      messages: this.messages,
      deleteRequests: this.deleteRequests,
      communities: this.communities,
      recoveryRequests: this.recoveryRequests,
      adminSessions: this.adminSessions,
      sessions: this.sessions,
      uploads: this.uploads,
      passwordResets: this.passwordResets,
      pendingRegistrations: this.pendingRegistrations,
      deviceKeys: this.deviceKeys,
      calls: this.calls,
      signVideos: this.signVideos,
      vocabulary: this.vocabulary,
      datasetConsents: this.datasetConsents,
      datasetSamples: this.datasetSamples,
      signModels: this.signModels,
    };
    writeFileSync(this.storeFilePath, JSON.stringify(payload, null, 2), "utf8");
  }

  private load() {
    if (!existsSync(this.storeFilePath)) return;
    try {
      const raw = readFileSync(this.storeFilePath, "utf8");
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as Partial<{
        users: User[];
        chats: Chat[];
        messages: Message[];
        deleteRequests: DeleteRequest[];
        communities: Community[];
        recoveryRequests: RecoveryRequest[];
        adminSessions: unknown[];
        sessions: DeviceSession[];
        uploads: UploadRecord[];
        passwordResets: PasswordResetCode[];
        pendingRegistrations: PendingRegistration[];
        deviceKeys: DeviceKeyRecord[];
        calls: CallRecord[];
        signVideos: SignVideo[];
        vocabulary: VocabularyEntry[];
        datasetConsents: DatasetConsent[];
        datasetSamples: DatasetSample[];
        signModels: SignModel[];
      }>;
      this.users = (parsed.users ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        passwordHash: u.passwordHash,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt ?? u.createdAt,
        status: u.status ?? "ACTIVE",
        suspensionReason: u.suspensionReason,
        suspendedAt: u.suspendedAt,
        suspendedBy: u.suspendedBy,
        preferences: u.preferences,
        blockedUserIds: Array.isArray(u.blockedUserIds) ? u.blockedUserIds : undefined,
      }));
      this.chats = (parsed.chats ?? []).map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        memberIds: c.memberIds,
        pinnedMessageId: c.pinnedMessageId,
        pinnedBy: c.pinnedBy,
        pinnedAt: c.pinnedAt,
        createdAt: c.createdAt,
      }));
      this.messages = (parsed.messages ?? []).map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        encryptedContent: m.encryptedContent,
        nonce: m.nonce,
        messageType: m.messageType,
        replyToMessageId: m.replyToMessageId,
        attachmentUrl: m.attachmentUrl,
        fileName: m.fileName,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        reactions: (m.reactions ?? []).map((r) => ({
          emoji: r.emoji,
          userIds: [...new Set(r.userIds ?? [])],
        })),
        isEdited: m.isEdited,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        readBy: m.readBy ?? [m.senderId],
        deliveredTo: m.deliveredTo ?? [m.senderId],
      }));
      this.deleteRequests = parsed.deleteRequests ?? [];
      this.communities = parsed.communities ?? [];
      this.recoveryRequests = (parsed.recoveryRequests ?? []).map((r) => ({
        ...r,
        aiVerification: r.aiVerification ?? { status: "PENDING" },
      }));
      // Old plain-string admin tokens are dropped on purpose (admins sign in again).
      this.adminSessions = Array.isArray(parsed.adminSessions)
        ? (parsed.adminSessions.filter((s) => typeof s === "object" && s !== null && "tokenHash" in s) as AdminSession[])
        : [];
      this.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      this.uploads = Array.isArray(parsed.uploads) ? parsed.uploads : [];
      // Old-format reset codes (keyed by phone) are simply dropped; they expire within minutes anyway.
      this.passwordResets = Array.isArray(parsed.passwordResets) ? parsed.passwordResets.filter((r) => typeof r?.userId === "string" && r.code) : [];
      const now = Date.now();
      this.pendingRegistrations = Array.isArray(parsed.pendingRegistrations) ? parsed.pendingRegistrations.filter((r) => Date.parse(r?.expiresAt) > now) : [];
      this.deviceKeys = Array.isArray(parsed.deviceKeys) ? parsed.deviceKeys : [];
      this.calls = Array.isArray(parsed.calls) ? parsed.calls : [];
      this.signVideos = Array.isArray(parsed.signVideos) ? parsed.signVideos : [];
      this.vocabulary = Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [];
      this.datasetConsents = Array.isArray(parsed.datasetConsents) ? parsed.datasetConsents : [];
      this.datasetSamples = Array.isArray(parsed.datasetSamples) ? parsed.datasetSamples : [];
      this.signModels = Array.isArray(parsed.signModels) ? parsed.signModels : [];
      this.persist();
    } catch {
      // Ignore corrupted store file.
    }
  }
}
