export type User = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  lastSeenAt?: string;
  createdAt: string;
  status?: "ACTIVE" | "SUSPENDED";
  suspensionReason?: string;
  suspendedAt?: string;
  suspendedBy?: "self" | "admin";
};

export type LoginResponse = {
  user: User;
  accessToken: string;
  tokenType: string;
};

export type AdminLoginResponse = {
  adminToken: string;
  username: string;
  tokenType: string;
};

export type AdminOverview = {
  users: number;
  activeUsers: number;
  suspendedUsers: number;
  chats: number;
  communities: number;
  messages: number;
  deleteRequests: number;
  pendingRecoveries: number;
};

export type Chat = {
  id: string;
  type: "ONE_TO_ONE" | "COMMUNITY";
  title?: string;
  memberIds: string[];
  pinnedMessageId?: string;
  pinnedBy?: string;
  pinnedAt?: string;
  createdAt: string;
};

export type MessageReaction = {
  emoji: string;
  userIds: string[];
};

export type ChatSummary = {
  chat: Chat;
  peer?: User;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  encryptedContent: string;
  nonce?: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "SYSTEM";
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

export type DeleteRequest = {
  id: string;
  chatId: string;
  requestedBy: string;
  targetUserId?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
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
  status: "PENDING" | "AI_PROCESSING" | "PENDING_ADMIN" | "APPROVED" | "REJECTED";
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
};

export type SignVideo = {
  id: string;
  signLanguageId: string;
  unit: "SENTENCE" | "PHRASE" | "SIGN";
  phraseText: string;
  gloss: string;
  meaning: string;
  signerId: string;
  region?: string;
  quality: "LOW" | "MEDIUM" | "HIGH";
  license: string;
  provenance: string;
  consentConfirmed: boolean;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  reviewNote?: string;
  verifiedAt?: string;
  sha256: string;
  uploadedBy: string;
  createdAt: string;
  url: string;
};

export type RawFrame = { t: number; hands: { h: "L" | "R"; s: number; p: number[] }[] };
export type VocabularyEntry = { id: string; language: string; gloss: string; meaning: string; createdAt: string };
export type DatasetSample = {
  id: string; consentId: string; signerId: string; language: string; gloss: string; frameCount: number;
  durationMs: number; handFrameRatio: number; status: "PENDING" | "APPROVED" | "REJECTED"; reviewNote?: string; createdAt: string;
};
export type DatasetStats = {
  language: string;
  totals: { samples: number; approved: number; pending: number; signers: number; consents: number };
  glosses: { gloss: string; meaning: string; approved: number; pending: number; signers: number }[];
};
export type DatasetExport = { samples: { id: string }[]; signers: { signerId: string }[] } & Record<string, unknown>;
export type SignModel = {
  id: string;
  manifest: {
    language: string; version: string; architecture: string; labels: { gloss: string; meaning: string }[]; threshold: number;
    metrics: { testAccuracy: number | null; validationAccuracy: number | null; signerIndependent: boolean; trainSamples: number; testSamples: number; signers: number };
  };
  sizeBytes: number; sha256: string; status: "PUBLISHED" | "WITHDRAWN"; uploadedAt: string; note?: string;
};
