import { useState, type ReactNode } from "react";
import {
  ChatIcon, GridIcon, ContactsIcon, GroupIcon, InfoIcon, LockIcon, LogOutIcon,
  HandIcon, MoonIcon, RefreshIcon, SendIcon, ShieldIcon, SunIcon, TrashIcon,
} from "../components/Icons";
import SignVideosReview from "./SignVideosReview";
import DatasetAdmin from "./DatasetAdmin";
import ModelsAdmin from "./ModelsAdmin";
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
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

type AdminTab = "overview" | "users" | "chats" | "messages" | "communities" | "delete-requests" | "recovery" | "sign-videos" | "dataset" | "models";

type ConfirmState = {
  type: "delete" | "suspend" | "restore" | "approve-recovery" | "reject-recovery";
  userId?: string;
  userName?: string;
  requestId?: string;
} | null;

export default function AdminDashboard({
  adminToken,
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
  backendReady,
  theme,
  onToggleTheme,
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

  const pendingErasures = adminDeleteRequests.filter((r) => r.status === "PENDING").length;
  const totalUsers = adminOverview?.users ?? adminUsers.length;
  const activeUsers = adminOverview?.activeUsers ?? 0;
  const suspendedUsers = adminOverview?.suspendedUsers ?? 0;
  const activeShare = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

  const tabs: { id: AdminTab; label: string; icon: ReactNode; count?: number; desc: string }[] = [
    { id: "overview", label: "Overview", icon: <GridIcon size={19} />, desc: "A calm read on the health of your workspace." },
    { id: "users", label: "Users", icon: <ContactsIcon size={19} />, count: adminUsers.length, desc: "Every registered account, with moderation controls." },
    { id: "chats", label: "Chat threads", icon: <ChatIcon size={19} />, count: adminChats.length, desc: "Direct and group conversations on the platform." },
    { id: "messages", label: "Messages", icon: <SendIcon size={19} />, count: adminMessages.length, desc: "Metadata audit of sent messages. Content stays private." },
    { id: "communities", label: "Communities", icon: <GroupIcon size={19} />, count: adminCommunities.length, desc: "Public and private communities and their invite codes." },
    { id: "delete-requests", label: "Erasure", icon: <TrashIcon size={19} />, count: pendingErasures || undefined, desc: "Mutual chat-erasure requests between members." },
    { id: "dataset", label: "Sign dataset", icon: <GridIcon size={19} />, count: undefined, desc: "Consent-based sign recordings (landmarks only): review, vocabulary and export for training." },
    { id: "models", label: "Sign models", icon: <ShieldIcon size={19} />, desc: "Trained sign-recognition models: publish, roll back and withdraw." },
    { id: "sign-videos", label: "Sign videos", icon: <HandIcon size={19} />, desc: "Review contributed human signing videos. Only verified videos are used in calls." },
    { id: "recovery", label: "Recovery", icon: <LockIcon size={19} />, count: pendingRecoveries.length || undefined, desc: "Account recovery requests with AI verification results." },
  ];
  const current = tabs.find((t) => t.id === adminTab)!;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="admin-dashboard-container animate-fade-in">
      {/* Rail */}
      <aside className="admin-rail">
        <div className="admin-brand">
          <span className="v-tile v-tile-sm"><ShieldIcon size={20} /></span>
          <div className="admin-brand-text">
            <span className="admin-brand-word">ELiSecureChat</span>
            <span className="admin-brand-sub">Admin console</span>
          </div>
        </div>

        <nav className="admin-nav-tabs" aria-label="Admin sections">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              className={`admin-tab-btn ${adminTab === t.id ? "active" : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
              aria-current={adminTab === t.id ? "page" : undefined}
              onClick={() => setAdminTab(t.id)}
            >
              <span className="admin-tab-icon">{t.icon}</span>
              <span className="admin-tab-label">{t.label}</span>
              {t.count !== undefined && (
                <span className={`admin-tab-count ${t.id === "recovery" || t.id === "delete-requests" ? "is-alert" : ""}`}>{t.count}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="admin-rail-footer">
          <div className="admin-conn-pill">
            <span className={`v-dot ${backendReady ? "on" : "off"}`} />
            {backendReady ? "Backend live" : "Backend offline"}
          </div>
          <div className="admin-rail-actions">
            <button className="btn-icon" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
            <button className="btn btn-secondary btn-sm admin-signout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <LogOutIcon size={15} /> <span className="admin-signout-text">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <section className="admin-main">
        <header className="admin-header-row">
          <div className="admin-title-col">
            <span className="admin-overline">{today}</span>
            <h1 key={current.id}>{current.label}</h1>
            <p>{current.desc}</p>
          </div>
          <div className="admin-actions-col">
            <button className="btn btn-secondary btn-sm btn-icon-label" onClick={handleRefresh} disabled={loading}>
              <RefreshIcon size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </header>

      {/* Body */}
      <div className="admin-dashboard-scroll-body scroll-container">

        {/* Overview */}
        {adminTab === "overview" && (
          <div className="admin-overview">
            <div className="admin-hero-card animate-slide-up">
              <div className="admin-hero-copy">
                <span className="v-overline-chip">Workspace health</span>
                <h2>{activeShare}% of accounts are active</h2>
                <p>{activeUsers} active · {suspendedUsers} suspended · {totalUsers} registered</p>
                <div className="admin-health-bar" role="img" aria-label={`${activeShare}% active`}>
                  <span style={{ width: `${activeShare}%` }} />
                </div>
              </div>
              <div className="admin-hero-attention">
                <button className="admin-attention-item" onClick={() => setAdminTab("recovery")}>
                  <span className="v-tile v-tile-sm"><LockIcon size={18} /></span>
                  <span className="txt"><strong>{adminOverview?.pendingRecoveries ?? pendingRecoveries.length}</strong> recoveries awaiting review</span>
                  <span className="arrow">→</span>
                </button>
                <button className="admin-attention-item" onClick={() => setAdminTab("delete-requests")}>
                  <span className="v-tile v-tile-sm"><TrashIcon size={18} /></span>
                  <span className="txt"><strong>{pendingErasures}</strong> erasure requests pending</span>
                  <span className="arrow">→</span>
                </button>
              </div>
            </div>

            <div className="admin-stats-grid">
              {[
                { label: "Total users", value: totalUsers, icon: <ContactsIcon size={20} />, tone: "" },
                { label: "Active users", value: activeUsers, icon: <ShieldIcon size={20} />, tone: "good" },
                { label: "Suspended", value: suspendedUsers, icon: <LockIcon size={20} />, tone: suspendedUsers > 0 ? "bad" : "" },
                { label: "Chat threads", value: adminOverview?.chats ?? 0, icon: <ChatIcon size={20} />, tone: "" },
                { label: "Messages", value: adminOverview?.messages ?? 0, icon: <SendIcon size={20} />, tone: "" },
                { label: "Communities", value: adminOverview?.communities ?? 0, icon: <GroupIcon size={20} />, tone: "" },
                { label: "Pending recoveries", value: adminOverview?.pendingRecoveries ?? 0, icon: <InfoIcon size={20} />, tone: (adminOverview?.pendingRecoveries ?? 0) > 0 ? "warn" : "" },
              ].map((s, i) => (
                <div key={s.label} className={`admin-stat-card animate-slide-up ${s.tone ? `tone-${s.tone}` : ""}`} style={{ animationDelay: `${80 + i * 40}ms` }}>
                  <span className="v-tile v-tile-sm">{s.icon}</span>
                  <strong className="stat-value">{s.value.toLocaleString()}</strong>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>
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
                          {isSuspended ? "Suspended" : "Active"}
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
                              {isActing ? "…" : "Restore"}
                            </button>
                          ) : (
                            <button
                              className="btn btn-warning btn-xs"
                              disabled={isActing}
                              onClick={() => { setSuspendReason("Violation of ELiSecureChat Community Guidelines and Terms of Service."); setConfirm({ type: "suspend", userId: u.id, userName: u.name }); }}
                            >
                              {isActing ? "…" : "Suspend"}
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-xs"
                            disabled={isActing}
                            onClick={() => setConfirm({ type: "delete", userId: u.id, userName: u.name })}
                          >
                            {isActing ? "…" : "Delete"}
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

        {adminTab === "sign-videos" && <SignVideosReview adminToken={adminToken} />}
        {adminTab === "dataset" && <DatasetAdmin adminToken={adminToken} />}
        {adminTab === "models" && <ModelsAdmin adminToken={adminToken} />}

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
                            {r.hasDocument && <span className="evidence-tag doc">Document</span>}
                            {r.hasVideo && <span className="evidence-tag vid">Video</span>}
                          </div>
                        </td>
                        <td>
                          <div className="ai-verification-cell">
                            {ai.status === "COMPLETED" ? (
                              <>
                                <div className={`ai-auth-badge ${ai.isAuthorized ? "authorized" : "failed"}`}>
                                  {ai.isAuthorized ? "Authorized" : "Not authorized"}
                                </div>
                                {ai.faceMatchScore !== undefined && (
                                  <div className="ai-mini-metric">
                                    Face: <strong>{ai.faceMatchScore}%</strong>
                                    <div className="ai-mini-bar">
                                      <div className="ai-mini-fill" style={{ width: `${ai.faceMatchScore}%`, background: ai.faceMatchScore >= 78 ? "var(--v-good)" : "var(--v-bad)" }} />
                                    </div>
                                  </div>
                                )}
                                <div className="ai-mini-checks">
                                  <span className={ai.documentAuthentic ? "ok" : "no"}>Doc</span>
                                  <span className={ai.nameMatch ? "ok" : "no"}>Name</span>
                                </div>
                              </>
                            ) : (
                              <span className="status-badge pending">{ai.status}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge recovery-status-${r.status.toLowerCase().replace(/_/g, "-")}`}>
                            {r.status === "PENDING_ADMIN" ? "Awaiting admin" :
                             r.status === "APPROVED" ? "Approved" :
                             r.status === "REJECTED" ? "Rejected" :
                             r.status === "AI_PROCESSING" ? "AI processing" : "Pending"}
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
                                {isActing ? "…" : "Approve"}
                              </button>
                              <button
                                className="btn btn-danger btn-xs"
                                disabled={isActing}
                                onClick={() => { setRejectNote(""); setConfirm({ type: "reject-recovery", requestId: r.id, userName: r.userName }); }}
                              >
                                {isActing ? "…" : "Reject"}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {r.status === "APPROVED" ? "Restored" : "Closed"}
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
      </section>

      {/* ── Inline Confirmation Modal (no window.confirm) ── */}
      {confirm && (
        <div className="modal-overlay animate-fade-in" onClick={() => setConfirm(null)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()}>

            {confirm.type === "delete" && (
              <>
                <h3>Delete account permanently</h3>
                <p>This will <strong>hard-delete all data</strong> for <strong>"{confirm.userName}"</strong> — messages, chats, profile, and recovery data. This <strong>cannot be undone</strong>.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={executeConfirm}>Yes, Delete Permanently</button>
                </div>
              </>
            )}

            {confirm.type === "restore" && (
              <>
                <h3>Restore account</h3>
                <p>Restore account for <strong>"{confirm.userName}"</strong>? They will be able to sign in again immediately.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-success" onClick={executeConfirm}>Yes, Restore Account</button>
                </div>
              </>
            )}

            {confirm.type === "suspend" && (
              <>
                <h3>Suspend account</h3>
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
                <h3>Approve account recovery</h3>
                <p>Approve the recovery request for <strong>"{confirm.userName}"</strong>? Their account will be restored and they can sign in immediately.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-success" onClick={executeConfirm}>Yes, Restore Account</button>
                </div>
              </>
            )}

            {confirm.type === "reject-recovery" && (
              <>
                <h3>Reject recovery request</h3>
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
