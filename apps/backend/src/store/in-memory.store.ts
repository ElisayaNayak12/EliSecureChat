import { Injectable, OnModuleInit } from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { v4 as uuidv4 } from "uuid";
import { AIVerificationResult, Chat, Community, DeleteRequest, Message, RecoveryRequest, User } from "./models";

@Injectable()
export class InMemoryStore implements OnModuleInit {
  users: User[] = [];
  chats: Chat[] = [];
  messages: Message[] = [];
  deleteRequests: DeleteRequest[] = [];
  communities: Community[] = [];
  recoveryRequests: RecoveryRequest[] = [];
  adminSessions: string[] = [];
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

  findUserByPhone(phone: string) {
    return this.users.find((u) => u.phone === phone);
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

  verifyAdminCredentials(username: string, password: string) {
    if (username !== this.adminUsername) return false;
    return this.verifyPassword(password, this.adminPasswordHash);
  }

  createAdminSession() {
    const token = `admin_${uuidv4()}`;
    this.adminSessions.push(token);
    if (this.adminSessions.length > 20) this.adminSessions.shift();
    this.persist();
    return token;
  }

  isValidAdminSession(token: string) {
    return this.adminSessions.includes(token);
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
  processAIVerification(requestId: string): RecoveryRequest | null {
    const req = this.recoveryRequests.find((r) => r.id === requestId);
    if (!req) return null;

    req.status = "AI_PROCESSING";
    req.aiVerification.status = "PROCESSING";
    this.persist();

    // Simulate AI result — realistic score based on having both document+video
    const hasDoc = req.hasDocument;
    const hasVid = req.hasVideo;
    const faceMatchScore = hasDoc && hasVid
      ? Math.round(78 + Math.random() * 18) // 78–96%
      : hasDoc || hasVid
      ? Math.round(55 + Math.random() * 20)  // 55–75%
      : Math.round(30 + Math.random() * 20); // 30–50%

    const documentAuthentic = hasDoc && faceMatchScore > 60;
    const user = this.users.find((u) => u.id === req.userId);
    const nameMatch = !!(user && documentAuthentic);
    const isAuthorized = faceMatchScore >= 78 && documentAuthentic && nameMatch;

    const result: AIVerificationResult = {
      status: "COMPLETED",
      faceMatchScore,
      documentAuthentic,
      nameMatch,
      isAuthorized,
      processedAt: new Date().toISOString(),
      summary: isAuthorized
        ? `Identity verified. Face match: ${faceMatchScore}%. Document authentic. Name confirmed. User is authorized.`
        : `Verification incomplete. Face match: ${faceMatchScore}%. ${!documentAuthentic ? "Document could not be verified." : ""} ${!nameMatch ? "Name mismatch detected." : ""}`,
    };

    req.aiVerification = result;
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
        adminSessions: string[];
      }>;
      this.users = (parsed.users ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        passwordHash: u.passwordHash,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt ?? u.createdAt,
        status: u.status ?? "ACTIVE",
        suspensionReason: u.suspensionReason,
        suspendedAt: u.suspendedAt,
        suspendedBy: u.suspendedBy,
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
      this.adminSessions = Array.isArray(parsed.adminSessions) ? parsed.adminSessions : [];
      this.persist();
    } catch {
      // Ignore corrupted store file.
    }
  }
}
