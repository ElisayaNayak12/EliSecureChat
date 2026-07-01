import type {
  AdminLoginResponse,
  AdminOverview,
  Chat,
  Community,
  DeleteRequest,
  Message,
  RecoveryRequest,
  User,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type")) {
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

export const api = {
  health: () => request<{ ok: boolean; service: string; timestamp: string }>("/health"),
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
  /** Hard-delete a user permanently (all data removed) */
  adminDeleteUser: (adminToken: string, userId: string) =>
    request<{ success: boolean; deletedUserId: string }>(`/admin/users/${userId}`, {
      method: "DELETE",
      headers: adminHeaders(adminToken),
    }),
  /** Soft-suspend a user with a reason */
  adminSuspendUser: (adminToken: string, userId: string, reason: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/suspend`, {
      method: "POST",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ reason }),
    }),
  /** Restore a suspended user */
  adminRestoreUser: (adminToken: string, userId: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/restore`, {
      method: "POST",
      headers: adminHeaders(adminToken),
    }),
  /** Get all account recovery requests */
  adminGetRecoveryRequests: (adminToken: string) =>
    request<RecoveryRequest[]>("/admin/recovery-requests", {
      headers: adminHeaders(adminToken),
    }),
  /** Approve a recovery request — restores user account */
  adminApproveRecovery: (adminToken: string, requestId: string) =>
    request<{ success: boolean }>(`/admin/recovery-requests/${requestId}/approve`, {
      method: "POST",
      headers: adminHeaders(adminToken),
    }),
  /** Reject a recovery request */
  adminRejectRecovery: (adminToken: string, requestId: string, adminNote?: string) =>
    request<{ success: boolean }>(`/admin/recovery-requests/${requestId}/reject`, {
      method: "POST",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ adminNote }),
    }),
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
};

export { API_URL };
