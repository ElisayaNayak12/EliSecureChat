export type UserStatus = "ACTIVE" | "SUSPENDED";

export type User = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  avatarUrl?: string;
  lastSeenAt?: string;
  createdAt: string;
  // Suspension fields
  status?: UserStatus;
  suspensionReason?: string;
  suspendedAt?: string;
  suspendedBy?: "self" | "admin";
};

export type PublicUser = Omit<User, "passwordHash">;

export type ChatType = "ONE_TO_ONE" | "COMMUNITY";

export type Chat = {
  id: string;
  type: ChatType;
  title?: string;
  memberIds: string[];
  pinnedMessageId?: string;
  pinnedBy?: string;
  pinnedAt?: string;
  createdAt: string;
};

export type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "SYSTEM";
export type MessageReaction = {
  emoji: string;
  userIds: string[];
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  encryptedContent: string;
  nonce?: string;
  messageType: MessageType;
  replyToMessageId?: string;
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  reactions: MessageReaction[];
  isEdited: boolean;
  createdAt: string;
  editedAt?: string;
  readBy: string[];
  deliveredTo: string[];
};

export type DeleteRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type DeleteRequest = {
  id: string;
  chatId: string;
  requestedBy: string;
  targetUserId?: string;
  status: DeleteRequestStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export type Community = {
  id: string;
  chatId: string;
  name: string;
  description?: string;
  privacy: "PUBLIC" | "PRIVATE";
  ownerId: string;
  inviteCode?: string;
  createdAt: string;
};

export type RecoveryRequestStatus =
  | "PENDING"
  | "AI_PROCESSING"
  | "PENDING_ADMIN"
  | "APPROVED"
  | "REJECTED";

export type AIVerificationResult = {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  faceMatchScore?: number;
  documentAuthentic?: boolean;
  nameMatch?: boolean;
  isAuthorized?: boolean;
  processedAt?: string;
  summary?: string;
};

export type RecoveryRequest = {
  id: string;
  userId: string;
  userName: string;
  phone: string;
  email?: string;
  reason: string;
  hasDocument: boolean;
  hasVideo: boolean;
  aiVerification: AIVerificationResult;
  status: RecoveryRequestStatus;
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
};
