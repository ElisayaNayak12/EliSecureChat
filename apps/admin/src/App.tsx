import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { AdminOverview, Chat, Community, DeleteRequest, Message, RecoveryRequest, User } from "./types";
import AdminDashboard from "./pages/AdminDashboard";
import { ShieldIcon } from "./components/Icons";

export function App() {
  const [status, setStatus] = useState("Ready");
  const [backendReady, setBackendReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("admin123");
  const [adminToken, setAdminToken] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminChats, setAdminChats] = useState<Chat[]>([]);
  const [adminMessages, setAdminMessages] = useState<Message[]>([]);
  const [adminCommunities, setAdminCommunities] = useState<Community[]>([]);
  const [adminDeleteRequests, setAdminDeleteRequests] = useState<DeleteRequest[]>([]);
  const [adminRecoveryRequests, setAdminRecoveryRequests] = useState<RecoveryRequest[]>([]);

  // Theme Sync on Mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial = savedTheme ?? "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // Health check polling
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setBackendReady(true);
      } catch {
        if (active) setBackendReady(false);
      }
    };
    void check();
    const t = setInterval(() => void check(), 2500);
    return () => { active = false; clearInterval(t); };
  }, []);

  // Periodic admin data refresh when logged in
  useEffect(() => {
    if (!adminToken || !backendReady) return;
    const t = setInterval(() => void refreshAdminData(adminToken), 5000);
    return () => clearInterval(t);
  }, [adminToken, backendReady]);

  function formatLastSeen(lastSeenAt?: string) {
    if (!lastSeenAt) return "last seen recently";
    const date = new Date(lastSeenAt);
    if (Number.isNaN(date.valueOf())) return "last seen recently";
    return `last seen ${date.toLocaleString()}`;
  }

  function resolveUserName(userId?: string) {
    if (!userId) return "Unknown";
    const fromUsers = adminUsers.find((u) => u.id === userId)?.name;
    return fromUsers ?? `User ${userId.slice(0, 6)}`;
  }

  function ensureBackend() {
    if (backendReady) return true;
    setStatus("Backend offline. Start NestJS service first.");
    return false;
  }

  async function adminSignIn(e: FormEvent) {
    e.preventDefault();
    if (!ensureBackend()) return;
    try {
      const result = await api.adminSignIn(adminUsername, adminPassword);
      setAdminToken(result.adminToken);
      await refreshAdminData(result.adminToken);
      setStatus("Admin authentication successful");
    } catch (err) {
      setStatus(`Admin Sign in failed: ${(err as Error).message}`);
    }
  }

  async function refreshAdminData(token = adminToken) {
    if (!ensureBackend()) return;
    if (!token) return;
    try {
      const [overview, users, chats, messages, communities, deleteRequestsData, recoveryData] = await Promise.all([
        api.adminOverview(token),
        api.adminUsers(token),
        api.adminChats(token),
        api.adminMessages(token),
        api.adminCommunities(token),
        api.adminDeleteRequests(token),
        api.adminGetRecoveryRequests(token),
      ]);
      setAdminOverview(overview);
      setAdminUsers(users);
      setAdminChats(chats);
      setAdminMessages(messages);
      setAdminCommunities(communities);
      setAdminDeleteRequests(deleteRequestsData);
      setAdminRecoveryRequests(recoveryData);
    } catch (err) {
      setStatus(`Failed to fetch admin stats: ${(err as Error).message}`);
    }
  }

  async function approveDeleteFromPopup(requestId: string) {
    if (!ensureBackend()) return;
    try {
      await api.approveDeleteRequest(requestId, "admin");
      setStatus("Erasure request approved by admin.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Approve failed: ${(err as Error).message}`);
    }
  }

  async function rejectDeleteFromPopup(request: DeleteRequest) {
    if (!ensureBackend()) return;
    try {
      await api.rejectDeleteRequest(request.id, "admin");
      setStatus("Erasure request rejected by admin.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Reject failed: ${(err as Error).message}`);
    }
  }

  /** Hard permanent delete — removes all user data */
  async function deleteUser(userId: string) {
    if (!ensureBackend()) return;
    // Optimistically remove from UI immediately
    setAdminUsers((prev) => prev.filter((u) => u.id !== userId));
    try {
      await api.adminDeleteUser(adminToken, userId);
      setStatus("User account permanently deleted.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Delete user failed: ${(err as Error).message}`);
      await refreshAdminData(adminToken);
    }
  }

  /** Soft-suspend a user with a reason */
  async function suspendUser(userId: string, reason: string) {
    if (!ensureBackend()) return;
    // Optimistic update
    setAdminUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, status: "SUSPENDED" as const, suspensionReason: reason } : u)
    );
    try {
      await api.adminSuspendUser(adminToken, userId, reason);
      setStatus("User account suspended.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Suspend failed: ${(err as Error).message}`);
      await refreshAdminData(adminToken);
    }
  }

  /** Restore a suspended user */
  async function restoreUser(userId: string) {
    if (!ensureBackend()) return;
    // Optimistic update
    setAdminUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, status: "ACTIVE" as const, suspensionReason: undefined } : u)
    );
    try {
      await api.adminRestoreUser(adminToken, userId);
      setStatus("User account restored. They can now sign in.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Restore failed: ${(err as Error).message}`);
      await refreshAdminData(adminToken);
    }
  }

  /** Approve recovery request — restores the user account */
  async function approveRecovery(requestId: string) {
    if (!ensureBackend()) return;
    // Optimistic update
    setAdminRecoveryRequests((prev) =>
      prev.map((r) => r.id === requestId ? { ...r, status: "APPROVED" as const } : r)
    );
    try {
      await api.adminApproveRecovery(adminToken, requestId);
      setStatus("Account recovery approved. User can now sign in again.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Approve recovery failed: ${(err as Error).message}`);
      await refreshAdminData(adminToken);
    }
  }

  /** Reject recovery request */
  async function rejectRecovery(requestId: string, note?: string) {
    if (!ensureBackend()) return;
    // Optimistic update
    setAdminRecoveryRequests((prev) =>
      prev.map((r) => r.id === requestId ? { ...r, status: "REJECTED" as const, adminNote: note } : r)
    );
    try {
      await api.adminRejectRecovery(adminToken, requestId, note);
      setStatus("Recovery request rejected.");
      await refreshAdminData(adminToken);
    } catch (err) {
      setStatus(`Reject recovery failed: ${(err as Error).message}`);
      await refreshAdminData(adminToken);
    }
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="ambient-background" />

      {/* Auth Gate Admin */}
      {!adminToken && (
        <section className="admin-login-overlay animate-fade-in" style={{ position: "static", display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          <div className="admin-login-card">
            <div className="admin-login-header">
              <ShieldIcon size={32} className="text-accent" />
              <h3>Admin Authorization Gate</h3>
              <p>Sign in using administrative credentials to review active databases.</p>
            </div>
            {status && <div className="auth-status-banner">{status}</div>}
            <form onSubmit={adminSignIn} className="auth-form">
              <div className="input-group">
                <label>Admin Username</label>
                <input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="input-group">
                <label>Admin Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="row mini" style={{ marginTop: "14px" }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!backendReady}>
                  Log In
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* Admin Dashboard Active */}
      {adminToken && (
        <AdminDashboard
          adminToken={adminToken}
          adminOverview={adminOverview}
          adminUsers={adminUsers}
          adminChats={adminChats}
          adminMessages={adminMessages}
          adminCommunities={adminCommunities}
          adminDeleteRequests={adminDeleteRequests}
          adminRecoveryRequests={adminRecoveryRequests}
          onRefreshData={refreshAdminData}
          onSignOut={() => { setAdminToken(""); setStatus("Signed out cleanly"); }}
          onApproveDelete={approveDeleteFromPopup}
          onRejectDelete={rejectDeleteFromPopup}
          onDeleteUser={deleteUser}
          onSuspendUser={suspendUser}
          onRestoreUser={restoreUser}
          onApproveRecovery={approveRecovery}
          onRejectRecovery={rejectRecovery}
          resolveUserName={resolveUserName}
          formatLastSeen={formatLastSeen}
          backendReady={backendReady}
        />
      )}
    </main>
  );
}
