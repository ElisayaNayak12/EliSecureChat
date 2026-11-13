import type {
  AdminLoginResponse,
  AdminOverview,
  Chat,
  Community,
  DeleteRequest,
  Message,
  RecoveryRequest,
  SignVideo,
  User,
  DatasetExport,
  DatasetSample,
  DatasetStats,
  RawFrame,
  SignModel,
  VocabularyEntry,
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
  adminSignOut: (adminToken: string) => request<{ ok: boolean }>("/auth/admin/sign-out", { method: "POST", headers: adminHeaders(adminToken) }),
  adminListSignVideos: (adminToken: string) =>
    request<SignVideo[]>("/admin/sign-videos", { headers: adminHeaders(adminToken) }),
  adminReviewSignVideo: (adminToken: string, id: string, status: SignVideo["verificationStatus"], note?: string) =>
    request<SignVideo>(`/admin/sign-videos/${id}`, {
      method: "PATCH",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ status, note }),
    }),
  adminDeleteSignVideo: (adminToken: string, id: string) =>
    request<{ ok: boolean }>(`/admin/sign-videos/${id}`, { method: "DELETE", headers: adminHeaders(adminToken) }),
  datasetStats: (language: string) => request<DatasetStats>(`/dataset/stats?language=${language}`),
  datasetVocabulary: (language: string) => request<VocabularyEntry[]>(`/dataset/vocabulary?language=${language}`),
  adminDatasetSamples: (adminToken: string) => request<DatasetSample[]>("/admin/dataset/samples", { headers: adminHeaders(adminToken) }),
  adminDatasetFrames: (adminToken: string, id: string) => request<RawFrame[]>(`/admin/dataset/samples/${id}/frames`, { headers: adminHeaders(adminToken) }),
  adminReviewDatasetSample: (adminToken: string, id: string, status: DatasetSample["status"]) =>
    request<DatasetSample>(`/admin/dataset/samples/${id}`, { method: "PATCH", headers: adminHeaders(adminToken), body: JSON.stringify({ status }) }),
  adminDeleteDatasetSample: (adminToken: string, id: string) =>
    request<{ ok: boolean }>(`/admin/dataset/samples/${id}`, { method: "DELETE", headers: adminHeaders(adminToken) }),
  adminAddVocabulary: (adminToken: string, body: { language: string; gloss: string; meaning: string }) =>
    request<VocabularyEntry>("/admin/dataset/vocabulary", { method: "POST", headers: adminHeaders(adminToken), body: JSON.stringify(body) }),
  adminRemoveVocabulary: (adminToken: string, id: string) =>
    request<{ ok: boolean }>(`/admin/dataset/vocabulary/${id}`, { method: "DELETE", headers: adminHeaders(adminToken) }),
  adminExportDataset: (adminToken: string, language: string) =>
    request<DatasetExport>(`/admin/dataset/export?language=${language}`, { headers: adminHeaders(adminToken) }),
  adminModels: (adminToken: string) => request<SignModel[]>("/admin/models", { headers: adminHeaders(adminToken) }),
  adminUploadModel: async (adminToken: string, model: File, manifest: File, note?: string) => {
    const form = new FormData();
    form.append("model", model);
    form.append("manifest", manifest);
    if (note) form.append("note", note);
    const res = await fetch(`${API_URL}/admin/models`, { method: "POST", headers: adminHeaders(adminToken), body: form });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as SignModel;
  },
  adminSetModelStatus: (adminToken: string, id: string, status: SignModel["status"]) =>
    request<SignModel>(`/admin/models/${id}`, { method: "PATCH", headers: adminHeaders(adminToken), body: JSON.stringify({ status }) }),
  adminDeleteModel: (adminToken: string, id: string) =>
    request<{ ok: boolean }>(`/admin/models/${id}`, { method: "DELETE", headers: adminHeaders(adminToken) }),
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
