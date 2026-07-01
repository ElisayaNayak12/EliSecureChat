import { useState } from "react";
import { InfoIcon, ShieldIcon, RefreshIcon, LogOutIcon } from "../components/Icons";
import type { AdminOverview, Chat, Community, DeleteRequest, RecoveryRequest, User, Message } from "../types";

interface AdminDashboardProps {
  adminToken: string;
  adminOverview: AdminOverview | null;
  adminUsers: User[];
  adminChats: Chat[];
  adminMessages: Message[];
  adminCommunities: Community[];
  adminDeleteRequests: DeleteRequest[];
  adminRecoveryRequests: RecoveryRequest[];
  onRefreshData: () => Promise<void>;
  onSignOut: () => void;
  onApproveDelete: (reqId: string) => Promise<void>;
  onRejectDelete: (request: DeleteRequest) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onSuspendUser: (userId: string, reason: string) => Promise<void>;
  onRestoreUser: (userId: string) => Promise<void>;
  onApproveRecovery: (requestId: string) => Promise<void>;
  onRejectRecovery: (requestId: string, note?: string) => Promise<void>;
  resolveUserName: (userId?: string) => string;
  formatLastSeen: (time?: string) => string;
  backendReady: boolean;
}

type AdminTab = "overview" | "users" | "chats" | "messages" | "communities" | "delete-requests" | "recovery";

type ConfirmState = {
  type: "delete" | "suspend" | "restore" | "approve-recovery" | "reject-recovery";
  userId?: string;
  userName?: string;
  requestId?: string;
} | null;

export default function AdminDashboard({
  adminOverview,
  adminUsers,
  adminChats,
  adminMessages,
  adminCommunities,
  adminDeleteRequests,
  adminRecoveryRequests,
  onRefreshData,
  onSignOut,
  onDeleteUser,
  onSuspendUser,
  onRestoreUser,
  onApproveRecovery,
  onRejectRecovery,
  resolveUserName,
  formatLastSeen,
}: AdminDashboardProps) {
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [suspendReason, setSuspendReason] = useState("Violation of ELiSecureChat Community Guidelines and Terms of Service.");
  const [rejectNote, setRejectNote] = useState("");

  const handleRefresh = async () => {
    setLoading(true);
    try { await onRefreshData(); } finally { setLoading(false); }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const id = confirm.userId ?? confirm.requestId ?? "";
    setActionId(id);
    setConfirm(null);
    try {
      switch (confirm.type) {
        case "delete": await onDeleteUser(confirm.userId!); break;
        case "suspend": await onSuspendUser(confirm.userId!, suspendReason); setSuspendReason("Violation of ELiSecureChat Community Guidelines and Terms of Service."); break;
        case "restore": await onRestoreUser(confirm.userId!); break;
        case "approve-recovery": await onApproveRecovery(confirm.requestId!); break;
        case "reject-recovery": await onRejectRecovery(confirm.requestId!, rejectNote || undefined); setRejectNote(""); break;
      }
    } finally {
      setActionId(null);
    }
  };

  const pendingRecoveries = adminRecoveryRequests.filter(
    (r) => r.status === "PENDING_ADMIN" || r.status === "PENDING"
  );

  return (
    <div className="admin-dashboard-container animate-fade-in">
      {/* Header */}
      <div className="admin-header-row">
        <div className="admin-title-col">
          <ShieldIcon size={28} className="text-accent" />
          <h1>Admin Management</h1>
        </div>
        <div className="admin-actions-col">
          <button className="btn btn-secondary btn-sm btn-icon-label" onClick={handleRefresh} disabled={loading}>
            <RefreshIcon size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button className="btn btn-danger btn-sm btn-icon-label" onClick={onSignOut}>
            <LogOutIcon size={14} /> Close Admin Mode
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-nav-tabs">
        {([
          { id: "overview", label: "Stats Overview" },
          { id: "users", label: "Registered Users" },
          { id: "chats", label: "Chat Threads" },
          { id: "messages", label: "Messages Audit" },
          { id: "communities", label: "Communities List" },
          { id: "delete-requests", label: "Erasure Requests" },
          { id: "recovery", label: `Account Recovery${pendingRecoveries.length > 0 ? ` (${pendingRecoveries.length})` : ""}` },
        ] as const).map((t) => (
          <button
            key={t.id}
            className={`admin-tab-btn ${adminTab === t.id ? "active" : ""} ${t.id === "recovery" && pendingRecoveries.length > 0 ? "has-badge" : ""}`}
            onClick={() => setAdminTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="admin-dashboard-scroll-body scroll-container">

        {/* Overview */}
        {adminTab === "overview" && (
          <div className="admin-stats-grid">
            {[
              { label: "Total Users", value: adminOverview?.users ?? 0, color: undefined },
              { label: "Active Users", value: adminOverview?.activeUsers ?? 0, color: "var(--color-success,#22c55e)" },
              { label: "Suspended", value: adminOverview?.suspendedUsers ?? 0, color: "var(--color-danger,#ef4444)" },
              { label: "Chat Threads", value: adminOverview?.chats ?? 0, color: undefined },
              { label: "Messages", value: adminOverview?.messages ?? 0, color: undefined },
              { label: "Communities", value: adminOverview?.communities ?? 0, color: undefined },
              { label: "Pending Recoveries", value: adminOverview?.pendingRecoveries ?? 0, color: (adminOverview?.pendingRecoveries ?? 0) > 0 ? "#f59e0b" : undefined },
            ].map((s, i) => (
              <div key={s.label} className="admin-stat-card animate-slide-up" style={{ animationDelay: `${i * 0.04}s` }}>
                <span className="stat-label">{s.label}</span>
                <strong className="stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Users */}
        {adminTab === "users" && (
          <div className="admin-table-wrapper animate-slide-up">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>User ID</th><th>Display Name</th><th>Phone</th><th>Email</th>
                  <th>Status</th><th>Last Seen</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => {
                  const isSuspended = (u.status ?? "ACTIVE") === "SUSPENDED";
                  const isActing = actionId === u.id;
                  return (
                    <tr key={u.id} className={isSuspended ? "suspended-row" : ""}>
                      <td><code style={{ fontSize: 11 }}>{u.id.slice(0, 8)}…</code></td>
                      <td><strong>{u.name}</strong></td>
                      <td>{u.phone}</td>
                      <td>{u.email ?? "—"}</td>
                      <td>
                        <span className={`status-badge ${isSuspended ? "suspended" : "active"}`}>
                          {isSuspended ? "🔴 Suspended" : "🟢 Active"}
                        </span>
                      </td>
                      <td><small>{formatLastSeen(u.lastSeenAt)}</small></td>
                      <td>
                        <div className="admin-action-cell">
                          {isSuspended ? (
                            <button
                              className="btn btn-success btn-xs"
                              disabled={isActing}
                              onClick={() => setConfirm({ type: "restore", userId: u.id, userName: u.name })}
                            >
                              {isActing ? "…" : "✅ Restore"}
                            </button>
                          ) : (
                            <button
                              className="btn btn-warning btn-xs"
                              disabled={isActing}
                              onClick={() => { setSuspendReason("Violation of ELiSecureChat Community Guidelines and Terms of Service."); setConfirm({ type: "suspend", userId: u.id, userName: u.name }); }}
                            >
                              {isActing ? "…" : "🚫 Suspend"}
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-xs"
                            disabled={isActing}
                            onClick={() => setConfirm({ type: "delete", userId: u.id, userName: u.name })}
                          >
                            {isActing ? "…" : "🗑 Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Chats */}
        {adminTab === "chats" && (
          <div className="admin-table-wrapper animate-slide-up">
            <table className="admin-data-table">
              <thead><tr><th>Chat ID</th><th>Type</th><th>Title</th><th>Members</th><th>Pinned Msg</th></tr></thead>
              <tbody>
                {adminChats.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id}</code></td>
                    <td>{c.type}</td>
                    <td>{c.title ?? "Direct Chat"}</td>
                    <td>{c.memberIds.length}</td>
                    <td>{c.pinnedMessageId ? <code>{c.pinnedMessageId.slice(0,8)}…</code> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Messages */}
        {adminTab === "messages" && (
          <div className="admin-table-wrapper animate-slide-up">
            <table className="admin-data-table">
              <thead><tr><th>Msg ID</th><th>Chat ID</th><th>Sender</th><th>Type</th><th>Date</th></tr></thead>
              <tbody>
                {adminMessages.map((m) => (
                  <tr key={m.id}>
                    <td><code>{m.id.slice(0,8)}…</code></td>
                    <td><code>{m.chatId.slice(0,8)}…</code></td>
                    <td>{resolveUserName(m.senderId)}</td>
                    <td>{m.messageType}</td>
                    <td><small>{new Date(m.createdAt).toLocaleString()}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Communities */}
        {adminTab === "communities" && (
          <div className="admin-table-wrapper animate-slide-up">
            <table className="admin-data-table">
              <thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Privacy</th><th>Invite Code</th></tr></thead>
              <tbody>
                {adminCommunities.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id.slice(0,8)}…</code></td>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.description ?? "—"}</td>
                    <td>{c.privacy}</td>
                    <td>{c.inviteCode ? <code>{c.inviteCode}</code> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete Requests */}
        {adminTab === "delete-requests" && (
          <div className="admin-table-wrapper animate-slide-up">
            {adminDeleteRequests.length === 0 ? (
              <div className="empty-state-box"><InfoIcon size={24} /><p>No active erasure requests.</p></div>
            ) : (
              <table className="admin-data-table">
                <thead><tr><th>Request ID</th><th>Chat ID</th><th>Requested By</th><th>Target User</th><th>Status</th></tr></thead>
                <tbody>
                  {adminDeleteRequests.map((r) => (
                    <tr key={r.id}>
                      <td><code>{r.id.slice(0,8)}…</code></td>
                      <td><code>{r.chatId.slice(0,8)}…</code></td>
                      <td>{resolveUserName(r.requestedBy)}</td>
                      <td>{resolveUserName(r.targetUserId)}</td>
                      <td><span className={`status-badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Account Recovery */}
        {adminTab === "recovery" && (
          <div className="admin-table-wrapper animate-slide-up">
            {adminRecoveryRequests.length === 0 ? (
              <div className="empty-state-box"><InfoIcon size={24} /><p>No account recovery requests yet.</p></div>
            ) : (
              <table className="admin-data-table recovery-table">
                <thead>
                  <tr>
                    <th>User</th><th>Phone</th><th>Reason</th>
                    <th>AI Verification</th><th>Status</th><th>Submitted</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRecoveryRequests.map((r) => {
                    const ai = r.aiVerification;
                    const isPending = r.status === "PENDING_ADMIN" || r.status === "PENDING";
                    const isActing = actionId === r.id;
                    return (
                      <tr key={r.id} className={`recovery-row ${r.status}`}>
                        <td>
                          <strong>{r.userName}</strong>
                          {r.email && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.email}</div>}
                        </td>
                        <td>{r.phone}</td>
                        <td>
                          <div className="recovery-reason-cell" title={r.reason}>
                            {r.reason.slice(0, 80)}{r.reason.length > 80 ? "…" : ""}
                          </div>
                          <div className="recovery-evidence-tags">
                            {r.hasDocument && <span className="evidence-tag doc">📄 Doc</span>}
                            {r.hasVideo && <span className="evidence-tag vid">🎥 Video</span>}
                          </div>
                        </td>
                        <td>
                          <div className="ai-verification-cell">
                            {ai.status === "COMPLETED" ? (
                              <>
                                <div className={`ai-auth-badge ${ai.isAuthorized ? "authorized" : "failed"}`}>
                                  {ai.isAuthorized ? "✅ AUTHORIZED" : "❌ NOT AUTH"}
                                </div>
                                {ai.faceMatchScore !== undefined && (
                                  <div className="ai-mini-metric">
                                    Face: <strong>{ai.faceMatchScore}%</strong>
                                    <div className="ai-mini-bar">
                                      <div className="ai-mini-fill" style={{ width: `${ai.faceMatchScore}%`, background: ai.faceMatchScore >= 78 ? "#22c55e" : "#ef4444" }} />
                                    </div>
                                  </div>
                                )}
                                <div className="ai-mini-checks">
                                  <span>{ai.documentAuthentic ? "✅" : "❌"} Doc</span>
                                  <span>{ai.nameMatch ? "✅" : "❌"} Name</span>
                                </div>
                              </>
                            ) : (
                              <span className="status-badge">⏳ {ai.status}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge recovery-status-${r.status.toLowerCase().replace(/_/g, "-")}`}>
                            {r.status === "PENDING_ADMIN" ? "⏳ Awaiting Admin" :
                             r.status === "APPROVED" ? "✅ Approved" :
                             r.status === "REJECTED" ? "❌ Rejected" :
                             r.status === "AI_PROCESSING" ? "🤖 AI Processing" : "⏳ Pending"}
                          </span>
                          {r.adminNote && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Note: {r.adminNote}</div>}
                        </td>
                        <td><small>{new Date(r.createdAt).toLocaleString()}</small></td>
                        <td>
                          {isPending ? (
                            <div className="admin-action-cell">
                              <button
                                className="btn btn-success btn-xs"
                                disabled={isActing}
                                onClick={() => setConfirm({ type: "approve-recovery", requestId: r.id, userName: r.userName })}
                              >
                                {isActing ? "…" : "✅ Approve"}
                              </button>
                              <button
                                className="btn btn-danger btn-xs"
                                disabled={isActing}
                                onClick={() => { setRejectNote(""); setConfirm({ type: "reject-recovery", requestId: r.id, userName: r.userName }); }}
                              >
                                {isActing ? "…" : "❌ Reject"}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {r.status === "APPROVED" ? "Restored ✅" : "Closed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Inline Confirmation Modal (no window.confirm) ── */}
      {confirm && (
        <div className="modal-overlay animate-fade-in" onClick={() => setConfirm(null)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()}>

            {confirm.type === "delete" && (
              <>
                <h3>🗑 Permanently Delete Account</h3>
                <p>This will <strong>hard-delete all data</strong> for <strong>"{confirm.userName}"</strong> — messages, chats, profile, and recovery data. This <strong>cannot be undone</strong>.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={executeConfirm}>Yes, Delete Permanently</button>
                </div>
              </>
            )}

            {confirm.type === "restore" && (
              <>
                <h3>✅ Restore Account</h3>
                <p>Restore account for <strong>"{confirm.userName}"</strong>? They will be able to sign in again immediately.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-success" onClick={executeConfirm}>Yes, Restore Account</button>
                </div>
              </>
            )}

            {confirm.type === "suspend" && (
              <>
                <h3>🚫 Suspend Account</h3>
                <p>Choose a reason for suspending <strong>"{confirm.userName}"</strong>. They will see this message when they try to sign in.</p>
                <select
                  className="suspend-reason-select"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  style={{ marginBottom: 10 }}
                >
                  <option value="Violation of ELiSecureChat Community Guidelines and Terms of Service.">General policy violation</option>
                  <option value="Inappropriate or offensive content detected in messages.">Inappropriate / offensive content</option>
                  <option value="Suspected harassment or bullying behavior reported by other users.">Harassment / bullying</option>
                  <option value="Spam or unsolicited promotional messages.">Spam activity</option>
                  <option value="Account compromise or suspicious login activity detected.">Account compromise / security</option>
                </select>
                <textarea
                  className="recovery-textarea"
                  placeholder="Or type a custom reason…"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                  maxLength={300}
                />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-warning" disabled={!suspendReason.trim()} onClick={executeConfirm}>Confirm Suspension</button>
                </div>
              </>
            )}

            {confirm.type === "approve-recovery" && (
              <>
                <h3>✅ Approve Account Recovery</h3>
                <p>Approve the recovery request for <strong>"{confirm.userName}"</strong>? Their account will be restored and they can sign in immediately.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-success" onClick={executeConfirm}>Yes, Restore Account</button>
                </div>
              </>
            )}

            {confirm.type === "reject-recovery" && (
              <>
                <h3>❌ Reject Recovery Request</h3>
                <p>Reject the account recovery for <strong>"{confirm.userName}"</strong>. Optionally provide a reason.</p>
                <textarea
                  className="recovery-textarea"
                  placeholder="Reason for rejection (optional)…"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={3}
                  maxLength={300}
                />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={executeConfirm}>Confirm Rejection</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
