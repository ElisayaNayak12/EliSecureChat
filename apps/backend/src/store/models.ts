import type { UserPreferences } from "../users/preferences";

export type UserStatus = "ACTIVE" | "SUSPENDED";

export type User = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  /** Proven by a code sent to the address/number (new accounts). Older accounts have neither. */
  emailVerified?: boolean;
  phoneVerified?: boolean;
  passwordHash: string;
  avatarUrl?: string;
  lastSeenAt?: string;
  createdAt: string;
  // Suspension fields
  status?: UserStatus;
  suspensionReason?: string;
  suspendedAt?: string;
  suspendedBy?: "self" | "admin";
  /** Language, accessibility and voice settings. Missing on older records; see resolvePreferences(). */
  preferences?: UserPreferences;
  /** Users this person has blocked. A block stops messages and calls in both directions. */
  blockedUserIds?: string[];
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
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_AVAILABLE";
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

/* ---- SignConnect Phase 3: call history ---- */
export type CallMedia = "AUDIO" | "VIDEO";
export type CallStatus = "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "DECLINED" | "FAILED";

export type CallRecord = {
  id: string;
  chatId: string;
  initiatedBy: string;
  participantIds: string[];
  media: CallMedia;
  status: CallStatus;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  /** True once either side turned on sign-language/caption assistance during the call. */
  aiAssistUsed?: boolean;
};

/* ---- SignConnect Phase 7: human sign-video library ---- */
export type SignVideoUnit = "SENTENCE" | "PHRASE" | "SIGN";
export type SignVideoVerification = "UNVERIFIED" | "VERIFIED" | "REJECTED";

export type SignVideo = {
  id: string;
  signLanguageId: string;
  unit: SignVideoUnit;
  /** Natural-language sentence/phrase this video expresses (what captions are matched against). */
  phraseText: string;
  normalizedPhrase: string;
  gloss: string;
  meaning: string;
  signerId: string;
  region?: string;
  quality: "LOW" | "MEDIUM" | "HIGH";
  license: string;
  provenance: string;
  /** Uploader confirmed the signer consented to recording and use. */
  consentConfirmed: boolean;
  verificationStatus: SignVideoVerification;
  reviewNote?: string;
  verifiedAt?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  createdAt: string;
};

/* ---- SignConnect: consent-based ISL dataset ---- */
export type VocabularyEntry = {
  id: string;
  language: string;
  gloss: string; // e.g. "THANK-YOU" (a label; the signer performs their own natural sign)
  meaning: string; // English text the sign translates to
  createdAt: string;
};

export type DatasetConsent = {
  id: string;
  userId: string; // account that recorded the consent
  signerId: string; // pseudonymous id stored with samples (never the real name)
  signerName: string; // kept only on the consent record
  language: string;
  consentVersion: string;
  agreeRecording: boolean;
  agreeTraining: boolean;
  isDeafOrNativeSigner: boolean;
  region?: string;
  createdAt: string;
  revokedAt?: string;
};

export type DatasetSampleStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Metadata only; frames live in a separate file (data/dataset/samples/<id>.json). */
export type DatasetSample = {
  id: string;
  consentId: string;
  signerId: string;
  userId: string;
  language: string;
  gloss: string;
  frameCount: number;
  durationMs: number;
  handFrameRatio: number;
  status: DatasetSampleStatus;
  reviewNote?: string;
  createdAt: string;
};

/* ---- SignConnect: trained sign-recognition model registry ---- */
export type SignModelManifest = {
  task: "SIGN_RECOGNITION";
  language: string;
  version: string;
  architecture: string;
  featureVersion: number;
  sequenceLength: number;
  featureDim: number;
  labels: { gloss: string; meaning: string }[];
  threshold: number;
  metrics: {
    testAccuracy: number | null;
    validationAccuracy: number | null;
    signerIndependent: boolean;
    trainSamples: number;
    testSamples: number;
    signers: number;
  };
  trainedAt: string;
  datasetExportedAt?: string;
};

export type SignModel = {
  id: string;
  manifest: SignModelManifest;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  status: "PUBLISHED" | "WITHDRAWN";
  uploadedAt: string;
  note?: string;
};

/* ---- Security: device sessions, upload ownership, password reset, admin sessions ---- */
export type DeviceSession = {
  id: string;
  userId: string;
  /** Rotation family: reusing an old refresh token revokes every session in the family. */
  familyId: string;
  refreshHash: string;
  /** Hashes of refresh tokens already rotated out (for reuse detection). */
  previousHashes: string[];
  device: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
};

export type UploadRecord = { fileName: string; ownerId: string; mimeType: string; createdAt: string };

/** A one-time code in flight (stored hashed). */
export type CodeState = { hash: string; expiresAt: string; attempts: number; sends: number; lastSentAt: string; verified: boolean };

export type PasswordResetCode = { userId: string; channel: "email" | "sms"; code: CodeState; createdAt: string };

/** Sign-up waiting for its email (and SMS, when available) code. No account exists until it is verified. */
export type PendingRegistration = {
  id: string;
  name: string;
  phone: string; // E.164
  email: string;
  passwordHash: string;
  createdAt: string;
  expiresAt: string;
  codes: { email?: CodeState; sms?: CodeState };
};

export type AdminSession = { tokenHash: string; expiresAt: string; createdAt: string };

/* ---- E2EE public key directory (public keys only; private keys never leave the device) ---- */
export type DeviceKeyRecord = {
  userId: string;
  deviceId: string;
  agreementKey: string; // ECDH P-256 public key, raw, base64
  signingKey: string; // ECDSA P-256 public key, raw, base64
  label: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
};
