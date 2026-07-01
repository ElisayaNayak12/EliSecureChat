import type {
  AdminLoginResponse,
  AdminOverview,
  Chat,
  ChatSummary,
  Community,
  DeleteRequest,
  LoginResponse,
  Message,
  User,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
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
      body: JSON.stringify({ name, phone, email, password }),
    }),
  signIn: (phone: string, password: string) =>
    request<LoginResponse>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    }),
  resetPassword: (phone: string, name: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ phone, name, newPassword }),
    }),
  login: (name: string, phone: string, email: string) =>
    request<LoginResponse>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ name, phone, email }),
    }),
  searchUsers: (q: string) => request<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
  getUser: (userId: string) => request<User>(`/users/${userId}`),
  updateProfile: (userId: string, payload: { name?: string; email?: string; avatarUrl?: string }) =>
    request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
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
