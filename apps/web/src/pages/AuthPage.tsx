import { FormEvent, useState } from "react";
import { LockIcon, ChatIcon } from "../components/Icons";
import { api } from "../api";
import RecoveryRequestFlow from "./RecoveryRequestFlow";

interface AuthPageProps {
  onSignIn: (phone: string, secret: string) => Promise<void>;
  onSignUp: (name: string, phone: string, email: string, secret: string) => Promise<void>;
  backendReady: boolean;
  status: string;
  socketConnected: boolean;
}

export default function AuthPage({
  onSignIn,
  onSignUp,
  backendReady,
  status,
  socketConnected,
}: AuthPageProps) {
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | "reset-password">("sign-in");
  const [name, setName] = useState("User One");
  const [phone, setPhone] = useState("9000000001");
  const [email, setEmail] = useState("user1@example.com");
  const [password, setPassword] = useState("secret123");
  const [loading, setLoading] = useState(false);

  // Suspension state
  const [suspendedUserId, setSuspendedUserId] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!backendReady) return;
    setLoading(true);
    try {
      if (authMode === "sign-in") {
        await onSignIn(phone, password);
      } else if (authMode === "sign-up") {
        await onSignUp(name, phone, email, password);
      } else {
        try {
          await api.resetPassword(phone, name, password);
          alert("Password reset successful! Please sign in with your new password.");
          setAuthMode("sign-in");
        } catch (err) {
          alert(`Password reset failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      // Check for ACCOUNT_SUSPENDED error
      const msg = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.code === "ACCOUNT_SUSPENDED" || parsed?.message === "ACCOUNT_SUSPENDED") {
          setSuspendedUserId(parsed.userId ?? "");
          setSuspensionReason(
            parsed.reason ?? "Your account has been suspended due to a policy violation."
          );
          return;
        }
      } catch {
        // not JSON, check for raw string
        if (msg.includes("ACCOUNT_SUSPENDED")) {
          setSuspendedUserId("");
          setSuspensionReason("Your account has been suspended due to a policy violation.");
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Show recovery wizard
  if (showRecovery && suspendedUserId !== null) {
    return (
      <RecoveryRequestFlow
        suspendedUserId={suspendedUserId}
        suspensionReason={suspensionReason}
        userPhone={phone}
        onClose={() => {
          setShowRecovery(false);
          setSuspendedUserId(null);
        }}
      />
    );
  }

  // Show suspension screen
  if (suspendedUserId !== null) {
    return (
      <div className="auth-container animate-fade-in">
        <div className="auth-card suspended-account-card">
          <div className="suspended-icon-wrap">
            <span className="suspended-shield">🚫</span>
          </div>
          <h2 className="suspended-title">Account Suspended</h2>
          <p className="suspended-subtitle">
            ELiSecureChat has detected activity that violates our Community Guidelines.
          </p>

          <div className="suspended-reason-box">
            <strong>Reason for suspension:</strong>
            <p>{suspensionReason}</p>
          </div>

          <div className="suspended-actions">
            <button
              className="btn btn-primary btn-block"
              onClick={() => setShowRecovery(true)}
            >
              🛡️ Request Account Recovery
            </button>
            <button
              className="btn btn-ghost btn-block"
              onClick={() => {
                setSuspendedUserId(null);
                setSuspensionReason("");
              }}
            >
              ← Try Different Account
            </button>
          </div>

          <div className="suspended-info-footer">
            <p>
              To recover your account, you will need to complete identity verification (Aadhaar card + face video). 
              Our AI agent will verify your identity and forward the result to our Trust & Safety team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container animate-fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrapper">
            <ChatIcon size={32} className="auth-logo-icon" />
          </div>
          <h1>ELiSecureChat</h1>
          <p className="auth-tagline">
            Realtime messaging with End-to-End Cryptography and Chat Erasure protocols.
          </p>
        </div>

        {status && <div className="auth-status-banner">{status}</div>}

        {authMode !== "reset-password" ? (
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "sign-in" ? "active" : ""}
              onClick={() => setAuthMode("sign-in")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={authMode === "sign-up" ? "active" : ""}
              onClick={() => setAuthMode("sign-up")}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="auth-tabs">
            <button
              type="button"
              className="active"
              onClick={() => setAuthMode("sign-in")}
            >
              ← Back to Sign In
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {(authMode === "sign-up" || authMode === "reset-password") && (
            <div className="input-group">
              <label htmlFor="name-input">
                {authMode === "reset-password" ? "Verify Full Name" : "Full Name"}
              </label>
              <input
                id="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="phone-input">Phone Number</label>
            <input
              id="phone-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9000000001"
              required
            />
          </div>

          {authMode === "sign-up" && (
            <div className="input-group">
              <label htmlFor="email-input">Email Address (Optional)</label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="pwd-input">
              {authMode === "reset-password" ? "New Password" : "Password"}
            </label>
            <input
              id="pwd-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {authMode === "sign-in" && (
            <div style={{ textAlign: "right", marginTop: "10px", marginBottom: "14px" }}>
              <button
                type="button"
                className="btn-link"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent-light)",
                  cursor: "pointer",
                  fontSize: "14px",
                  textDecoration: "underline",
                  padding: 0
                }}
                onClick={() => setAuthMode("reset-password")}
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!backendReady || loading}
          >
            {loading
              ? "Please wait..."
              : authMode === "sign-in"
              ? "Sign In"
              : authMode === "sign-up"
              ? "Create Account"
              : "Reset Password"}
          </button>
        </form>

        <div className="auth-footer-stats">
          <div className="stat-indicator">
            <span className={`indicator-dot ${backendReady ? "active" : "inactive"}`} />
            <span>API Server: {backendReady ? "Connected" : "Offline"}</span>
          </div>
          <div className="stat-indicator">
            <span className={`indicator-dot ${socketConnected ? "active" : "inactive"}`} />
            <span>Realtime Gateway: {socketConnected ? "Connected" : "Connecting..."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
