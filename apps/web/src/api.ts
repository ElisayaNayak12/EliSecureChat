import type {
  AdminLoginResponse,
  AdminOverview,
  Chat,
  ChatSummary,
  Community,
  DeleteRequest,
  LoginResponse,
  Message,
  CallRecord,
  DatasetConsent,
  DatasetSample,
  DatasetStats,
  PreferencesPatch,
  SignVideo,
  SignVideoLookup,
  SignLanguagePack,
  SpokenLanguage,
  User,
  UserPreferences,
} from "./types";
import type { DeviceSessionInfo } from "./types";

export type SignUpPending = { registrationId: string; email: string; phone: string; channels: { email: boolean; sms: boolean }; codeMinutes: number; resendAfterSeconds: number };
import { clientAuthFields, getAccessToken, refreshSession } from "./session";
import { API_URL } from "./config";

async function send(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
}

/** Authenticated request. On 401 it refreshes the session once and retries; if that fails the session ends. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await send(path, init);
  if (response.status === 401 && getAccessToken() && !path.startsWith("/auth/")) {
    const renewed = await refreshSession();
    if (renewed) response = await send(path, init);
  }
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

function adminHeaders(adminToken: string) {
  return {
    "x-admin-token": adminToken,
  };
}

type SendMessageInput = {
  chatId: string;
  senderId: string;
  encryptedContent: string;
  messageType?: Message["messageType"];
  replyToMessageId?: string;
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

export const api = {
  health: () => request<{ ok: boolean; service: string; timestamp: string }>("/health"),
  signUp: (name: string, phone: string, email: string, password: string) =>
    request<LoginResponse>("/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ name, phone, email: email || undefined, password, ...clientAuthFields() }),
    }),
  signIn: (phone: string, password: string) =>
    request<LoginResponse>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ phone, password, ...clientAuthFields() }),
    }),
  /** What the server can deliver (email/SMS) and its default country, for sign-up and forgot-password screens. */
  authOptions: () =>
    request<{ defaultCountry: string; verification: { email: boolean; sms: boolean }; resetChannels: { email: boolean; sms: boolean }; passwordRules: string }>("/auth/options"),
  /** Verified sign-up, step 1: validates everything and sends the code(s). */
  signUpStart: (body: { name: string; phone: string; email: string; password: string; country?: string }) =>
    request<SignUpPending>("/auth/sign-up/start", { method: "POST", body: JSON.stringify(body) }),
  signUpResend: (registrationId: string, channel: "email" | "sms") =>
    request<SignUpPending>("/auth/sign-up/resend", { method: "POST", body: JSON.stringify({ registrationId, channel }) }),
  /** Step 2: the code(s); returns a signed-in session like sign-in. */
  signUpVerify: (registrationId: string, emailCode: string, smsCode?: string) =>
    request<LoginResponse>("/auth/sign-up/verify", { method: "POST", body: JSON.stringify({ registrationId, emailCode, smsCode, ...clientAuthFields() }) }),
  requestPasswordReset: (identifier: string, channel: "email" | "sms") =>
    request<{ ok: boolean; message: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ identifier, channel }) }),
  confirmPasswordReset: (identifier: string, code: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ identifier, code, newPassword }) }),
  listSessions: () => request<DeviceSessionInfo[]>("/auth/sessions"),
  blockUser: (userId: string, targetId: string) =>
    request<{ ok: boolean; blocked: string[] }>(`/users/${userId}/blocks`, { method: "POST", body: JSON.stringify({ targetId }) }),
  unblockUser: (userId: string, targetId: string) =>
    request<{ ok: boolean; blocked: string[] }>(`/users/${userId}/blocks/${targetId}`, { method: "DELETE" }),
  registerDeviceKeys: (body: { deviceId: string; agreementKey: string; signingKey: string; label: string }) =>
    request<{ deviceId: string }>("/keys/devices", { method: "POST", body: JSON.stringify(body) }),
  chatDeviceKeys: (chatId: string) =>
    request<{ userId: string; deviceId: string; agreementKey: string; signingKey: string; revoked: boolean }[]>(`/keys/chats/${chatId}`),
  revokeSession: (id: string) => request<{ ok: boolean }>(`/auth/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () => request<{ ok: boolean }>("/auth/sessions/revoke-others", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  searchUsers: (q: string) => request<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
  getUser: (userId: string) => request<User>(`/users/${userId}`),
  updateProfile: (userId: string, payload: { name?: string; email?: string; avatarUrl?: string }) =>
    request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listSignLanguages: () => request<SignLanguagePack[]>("/languages/sign"),
  listSpokenLanguages: () => request<SpokenLanguage[]>("/languages/spoken"),
  lookupSignVideo: (language: string, text: string) =>
    request<SignVideoLookup>(`/sign-videos/lookup?language=${encodeURIComponent(language)}&text=${encodeURIComponent(text)}`),
  listMySignVideos: (userId: string) => request<SignVideo[]>(`/sign-videos?uploadedBy=${encodeURIComponent(userId)}`),
  uploadSignVideo: (form: FormData) => request<SignVideo>("/sign-videos", { method: "POST", body: form }),
  listCalls: (userId: string) => request<CallRecord[]>(`/calls?userId=${encodeURIComponent(userId)}`),
  datasetStats: (language: string) => request<DatasetStats>(`/dataset/stats?language=${encodeURIComponent(language)}`),
  listDatasetConsents: (userId: string) => request<DatasetConsent[]>(`/dataset/consents?userId=${encodeURIComponent(userId)}`),
  createDatasetConsent: (body: Record<string, unknown>) =>
    request<DatasetConsent>("/dataset/consents", { method: "POST", body: JSON.stringify(body) }),
  revokeDatasetConsent: (id: string, userId: string) =>
    request<{ ok: boolean; deletedSamples: number }>(`/dataset/consents/${id}/revoke`, { method: "POST", body: JSON.stringify({ userId }) }),
  listMyDatasetSamples: (userId: string) => request<DatasetSample[]>(`/dataset/samples?userId=${encodeURIComponent(userId)}`),
  addDatasetSample: (body: Record<string, unknown>) => request<DatasetSample>("/dataset/samples", { method: "POST", body: JSON.stringify(body) }),
  deleteMyDatasetSample: (id: string, userId: string) =>
    request<{ ok: boolean }>(`/dataset/samples/${id}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  getPreferences: (userId: string) => request<UserPreferences>(`/users/${userId}/preferences`),
  updatePreferences: (userId: string, patch: PreferencesPatch) =>
    request<UserPreferences>(`/users/${userId}/preferences`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  listChats: (userId: string) => request<Chat[]>(`/chats?userId=${encodeURIComponent(userId)}`),
  listChatSummaries: (userId: string) =>
    request<ChatSummary[]>(`/chats/summaries?userId=${encodeURIComponent(userId)}`),
  createOneToOneChat: (me: string, peer: string) =>
    request<Chat>("/chats", {
      method: "POST",
      body: JSON.stringify({ type: "ONE_TO_ONE", memberIds: [me, peer] }),
    }),
  clearChatHistory: (chatId: string, userId: string) =>
    request<{ chatId: string; clearedMessages: number }>(`/chats/${chatId}/clear-history`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  deleteChat: (chatId: string, userId: string) =>
    request<{ chatId: string; deleted: boolean }>(`/chats/${chatId}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  listMessages: (chatId: string) => request<Message[]>(`/messages/${chatId}`),
  markRead: (chatId: string, userId: string, messageIds?: string[]) =>
    request<{ chatId: string; userId: string; messageIds: string[] }>(`/messages/${chatId}/read`, {
      method: "POST",
      body: JSON.stringify({ userId, messageIds }),
    }),
  toggleReaction: (messageId: string, userId: string, emoji: string) =>
    request<{ messageId: string; reactions: Message["reactions"] }>(`/messages/${messageId}/reactions/toggle`, {
      method: "POST",
      body: JSON.stringify({ userId, emoji }),
    }),
  pinMessage: (messageId: string, userId: string) =>
    request<{ chatId: string; pinnedMessageId?: string; pinnedBy?: string; pinnedAt?: string }>(
      `/messages/${messageId}/pin`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    ),
  unpinMessage: (chatId: string, userId: string) =>
    request<{ chatId: string; pinnedMessageId?: string; pinnedBy?: string; pinnedAt?: string }>(
      `/messages/${chatId}/unpin`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    ),
  sendMessage: (payload: SendMessageInput) =>
    request<Message>("/messages", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string; fileName: string; mimeType: string; fileSize: number }>("/uploads", {
      method: "POST",
      body: form,
    });
  },
  editMessage: (messageId: string, encryptedContent: string) =>
    request<Message>(`/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ encryptedContent }),
    }),
  createDeleteRequest: (chatId: string, requestedBy: string, targetUserId?: string) =>
    request<DeleteRequest>("/messages/delete-requests", {
      method: "POST",
      body: JSON.stringify({ chatId, requestedBy, targetUserId }),
    }),
  listDeleteRequests: (chatId: string) =>
    request<DeleteRequest[]>(`/messages/delete-requests/chat/${chatId}`),
  listUserDeleteRequests: (userId: string) =>
    request<DeleteRequest[]>(`/messages/delete-requests/user/${userId}`),
  approveDeleteRequest: (requestId: string, userId: string) =>
    request<DeleteRequest>(`/messages/delete-requests/${requestId}/approve`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  rejectDeleteRequest: (requestId: string, userId: string) =>
    request<DeleteRequest>(`/messages/delete-requests/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  listCommunities: () => request<Community[]>("/communities"),
  createCommunity: (ownerId: string, name: string, description: string, privacy: "PUBLIC" | "PRIVATE") =>
    request<Community>("/communities", {
      method: "POST",
      body: JSON.stringify({ ownerId, name, description, privacy }),
    }),
  adminSignIn: (username: string, password: string) =>
    request<AdminLoginResponse>("/auth/admin/sign-in", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  adminOverview: (adminToken: string) =>
    request<AdminOverview>("/admin/overview", {
      headers: adminHeaders(adminToken),
    }),
  adminUsers: (adminToken: string) =>
    request<User[]>("/admin/users", {
      headers: adminHeaders(adminToken),
    }),
  adminChats: (adminToken: string) =>
    request<Chat[]>("/admin/chats", {
      headers: adminHeaders(adminToken),
    }),
  adminMessages: (adminToken: string) =>
    request<Message[]>("/admin/messages", {
      headers: adminHeaders(adminToken),
    }),
  adminCommunities: (adminToken: string) =>
    request<Community[]>("/admin/communities", {
      headers: adminHeaders(adminToken),
    }),
  adminDeleteRequests: (adminToken: string) =>
    request<DeleteRequest[]>("/admin/delete-requests", {
      headers: adminHeaders(adminToken),
    }),
  deleteAccount: (userId: string) =>
    request<{ success: boolean; suspendedUserId: string }>(`/users/${userId}`, {
      method: "DELETE",
    }),
  submitRecoveryRequest: (userId: string, reason: string, hasDocument: boolean, hasVideo: boolean) =>
    request<{ success: boolean; requestId: string; aiResult?: unknown }>("/users/recovery-request", {
      method: "POST",
      body: JSON.stringify({ userId, reason, hasDocument, hasVideo }),
    }),
  getRecoveryStatus: (userId: string) =>
    request<{ hasRequest: boolean; request: unknown | null }>(`/users/${userId}/recovery-status`),
  adminGetRecoveryRequests: (adminToken: string) =>
    request<import("./types").RecoveryRequest[]>("/admin/recovery-requests", {
      headers: adminHeaders(adminToken),
    }),
  adminApproveRecovery: (adminToken: string, requestId: string) =>
    request<{ success: boolean }>(`/admin/recovery-requests/${requestId}/approve`, {
      method: "POST",
      headers: adminHeaders(adminToken),
    }),
  adminRejectRecovery: (adminToken: string, requestId: string, adminNote?: string) =>
    request<{ success: boolean }>(`/admin/recovery-requests/${requestId}/reject`, {
      method: "POST",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ adminNote }),
    }),
  adminSuspendUser: (adminToken: string, userId: string, reason: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/suspend`, {
      method: "POST",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ reason }),
    }),
  adminRestoreUser: (adminToken: string, userId: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/restore`, {
      method: "POST",
      headers: adminHeaders(adminToken),
    }),
};

export { API_URL };
