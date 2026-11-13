export type User = {
  blockedUserIds?: string[];
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

export type BlockList = string[];

export type LoginResponse = {
  user: User;
  accessToken: string;
  expiresIn: number;
  sessionId: string;
  tokenType: string;
};

export type DeviceSessionInfo = { id: string; device: string; createdAt: string; lastUsedAt: string; current: boolean };

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

/* ---- SignConnect Phase 1a: languages & preferences (mirrors backend shapes) ---- */
export type ImplementationStatus = "WORKING" | "PROTOTYPE" | "MOCK" | "RESEARCH" | "NOT_IMPLEMENTED";

export type SignLanguagePack = {
  id: string;
  code: string;
  name: string;
  region: string;
  pairedSpokenLanguages: string[];
  lifecycle: "IN_DEVELOPMENT" | "PLANNED";
  roadmapPhase: number;
  metadata: { description: string; writtenGlossConvention: string | null };
  vocabulary: { glossCount: number; status: ImplementationStatus };
  recognitionModel: { id: string; version: string; status: ImplementationStatus } | null;
  translationModel: { id: string; version: string; status: ImplementationStatus } | null;
  videoLibrary: { verifiedClipCount: number; sentenceLevelClipCount: number; status: ImplementationStatus };
  datasetReferences: { name: string; licenseReview: string; notes: string }[];
};

export type SpokenLanguage = { id: string; name: string };

export type TextSize = "default" | "large" | "x-large";

export type UserPreferences = {
  preferredLanguage: string;
  preferredSignLanguage: string | null;
  accessibility: { textSize: TextSize; highContrast: boolean; reduceMotion: boolean; visualAlerts: boolean };
  voice: { voiceName: string | null; speakingRate: number };
  theme: "system" | "light" | "dark";
  updatedAt: string | null;
};

export type PreferencesPatch = {
  preferredLanguage?: string;
  preferredSignLanguage?: string | null;
  accessibility?: Partial<UserPreferences["accessibility"]>;
  voice?: Partial<UserPreferences["voice"]>;
  theme?: UserPreferences["theme"];
};

/* ---- SignConnect Phase 3/7: calls and human sign-video library ---- */
export type SignVideo = {
  id: string;
  signLanguageId: string;
  unit: "SENTENCE" | "PHRASE" | "SIGN";
  phraseText: string;
  normalizedPhrase: string;
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
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  createdAt: string;
  url: string;
};

export type SignVideoLookup = {
  match: SignVideo | null;
  reason: "EXACT_VERIFIED_MATCH" | "NO_VERIFIED_VIDEO_FOR_SENTENCE" | "LANGUAGE_HAS_NO_VERIFIED_VIDEOS" | "EMPTY_TEXT";
};

export type CallRecord = {
  id: string;
  chatId: string;
  initiatedBy: string;
  participantIds: string[];
  media: "AUDIO" | "VIDEO";
  status: "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "DECLINED" | "FAILED";
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  aiAssistUsed?: boolean;
};

/* ---- SignConnect: consent-based dataset ---- */
export type DatasetConsent = {
  id: string;
  userId: string;
  signerId: string;
  signerName: string;
  language: string;
  consentVersion: string;
  agreeRecording: boolean;
  agreeTraining: boolean;
  isDeafOrNativeSigner: boolean;
  region?: string;
  createdAt: string;
  revokedAt?: string;
};

export type DatasetSample = {
  id: string;
  consentId: string;
  signerId: string;
  language: string;
  gloss: string;
  frameCount: number;
  durationMs: number;
  handFrameRatio: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote?: string;
  createdAt: string;
};

export type DatasetStats = {
  language: string;
  totals: { samples: number; approved: number; pending: number; signers: number; consents: number };
  glosses: { gloss: string; meaning: string; approved: number; pending: number; signers: number }[];
};
