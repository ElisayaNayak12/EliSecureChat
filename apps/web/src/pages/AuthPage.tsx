import { FormEvent, useEffect, useState } from "react";
import type { CountryCode } from "libphonenumber-js/min";
import { LockIcon, ChatIcon, HandIcon, ShieldIcon } from "../components/Icons";
import { api, type SignUpPending } from "../api";
import type { LoginResponse } from "../types";
import { OtpInput, PasswordField, PhoneField, ResendButton, passwordProblem, phoneE164, readError, type PhoneValue } from "../components/AuthFields";
import RecoveryRequestFlow from "./RecoveryRequestFlow";

interface AuthPageProps {
  /** identifier = phone number (any format) or email. */
  onSignIn: (identifier: string, secret: string) => Promise<void>;
  /** Called with the new session once the sign-up codes are verified. */
  onSignedUp: (result: LoginResponse) => void;
  backendReady: boolean;
  status: string;
  socketConnected: boolean;
}

type Mode = "sign-in" | "sign-up" | "verify" | "forgot";
type AuthOptions = Awaited<ReturnType<typeof api.authOptions>>;

/** Turns server codes inside the app status line into plain language. */
function friendlyStatus(status: string) {
  if (/INVALID_CREDENTIALS/.test(status)) return "Wrong phone number, email or password.";
  if (/TOO_MANY_ATTEMPTS/.test(status)) return "Too many failed attempts. Try again in 15 minutes, or use Forgot password.";
  if (/TOO_MANY_REQUESTS/.test(status)) return "Too many requests. Please wait a minute.";
  return status;
}

export default function AuthPage({ onSignIn, onSignedUp, backendReady, status }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [options, setOptions] = useState<AuthOptions | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneValue>({ country: "IN", number: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // sign-up verification
  const [pending, setPending] = useState<SignUpPending | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  // forgot password
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetChannel, setResetChannel] = useState<"email" | "sms">("email");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetPhone, setResetPhone] = useState<PhoneValue>({ country: "IN", number: "" });
  const [code, setCode] = useState("");

  // Suspension state
  const [suspendedUserId, setSuspendedUserId] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    if (!backendReady || options) return;
    api
      .authOptions()
      .then((o) => {
        setOptions(o);
        const cc = (o.defaultCountry || "IN") as CountryCode;
        setPhone((p) => (p.number ? p : { ...p, country: cc }));
        setResetPhone((p) => (p.number ? p : { ...p, country: cc }));
        if (!o.resetChannels.email && o.resetChannels.sms) setResetChannel("sms");
      })
      .catch(() => undefined);
  }, [backendReady, options]);

  /** Editing a field clears the error shown for it. */
  const edit = <T,>(field: string, setter: (v: T) => void) => (v: T) => {
    setter(v);
    setFieldErrors((e) => {
      if (!e[field]) return e;
      const { [field]: _gone, ...rest } = e;
      return rest;
    });
  };

  const go = (m: Mode) => {
    setMode(m);
    setNotice(null);
    setFieldErrors({});
    setPassword("");
    setPassword2("");
    if (m === "forgot") {
      setResetStep("request");
      setCode("");
    }
  };

  const resetTarget = () => (resetChannel === "email" ? resetIdentifier.trim() : phoneE164(resetPhone) ?? resetPhone.number.trim());

  const sendResetCode = async (again = false) => {
    const r = await api.requestPasswordReset(resetTarget(), resetChannel);
    setNotice({ ok: true, text: again ? "A new code was sent if an account matches." : r.message });
  };

  const resend = async (channel: "email" | "sms") => {
    if (!pending) return;
    try {
      const p = await api.signUpResend(pending.registrationId, channel);
      setPending(p);
      setNotice({ ok: true, text: channel === "email" ? `New code sent to ${p.email}.` : `New code sent by SMS to ${p.phone}.` });
    } catch (err) {
      setNotice({ ok: false, text: readError(err).message });
      throw err;
    }
  };

  const canSubmit = (() => {
    if (mode === "sign-in") return !!identifier.trim() && !!password;
    if (mode === "sign-up") return !!name.trim() && !!phone.number.trim() && !!email.trim() && !!password && password === password2;
    if (mode === "verify") return emailCode.length === 6 && (!pending?.channels.sms || smsCode.length === 6);
    if (resetStep === "request") return resetChannel === "email" ? resetIdentifier.includes("@") : !!phoneE164(resetPhone);
    return code.length === 6 && !!password && password === password2;
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!backendReady || !canSubmit) return;
    setLoading(true);
    setNotice(null);
    setFieldErrors({});
    try {
      if (mode === "sign-in") {
        await onSignIn(identifier.trim(), password);
      } else if (mode === "sign-up") {
        const e164 = phoneE164(phone);
        const problem = passwordProblem(password, { name, phone: e164 ?? "", email });
        if (!e164) return setFieldErrors({ phone: "This number is not valid for the selected country." });
        if (problem) return setFieldErrors({ password: problem });
        try {
          const p = await api.signUpStart({ name: name.trim(), phone: e164, email: email.trim(), password, country: phone.country });
          setPending(p);
          setEmailCode("");
          setSmsCode("");
          setMode("verify");
        } catch (err) {
          const { message, field } = readError(err);
          if (field) setFieldErrors({ [field]: message });
          else setNotice({ ok: false, text: message });
        }
      } else if (mode === "verify" && pending) {
        try {
          const result = await api.signUpVerify(pending.registrationId, emailCode, pending.channels.sms ? smsCode : undefined);
          onSignedUp(result);
        } catch (err) {
          const { message, field } = readError(err);
          if (/expired/i.test(message) && !field) {
            setNotice({ ok: false, text: message });
            setMode("sign-up");
          } else if (field) setFieldErrors({ [field]: message });
          else setNotice({ ok: false, text: message });
        }
      } else if (mode === "forgot") {
        try {
          if (resetStep === "request") {
            await sendResetCode();
            setResetStep("confirm");
          } else {
            const problem = passwordProblem(password);
            if (problem) return setNotice({ ok: false, text: problem });
            await api.confirmPasswordReset(resetTarget(), code, password);
            go("sign-in");
            setIdentifier(resetChannel === "email" ? resetIdentifier.trim() : resetPhone.number);
            setNotice({ ok: true, text: "Password changed. You were signed out on all devices; sign in with your new password." });
          }
        } catch (err) {
          const m = readError(err).message;
          setNotice({
            ok: false,
            text: /INVALID_CODE/.test(m) ? "That code is not correct." : /CODE_EXPIRED/.test(m) ? "The code expired. Tap Resend code." : /TOO_MANY/.test(m) ? "Too many attempts. Request a new code." : m,
          });
        }
      }
    } catch (err) {
      // Check for ACCOUNT_SUSPENDED error
      const msg = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.code === "ACCOUNT_SUSPENDED" || parsed?.message === "ACCOUNT_SUSPENDED") {
          setSuspendedUserId(parsed.userId ?? "");
          setSuspensionReason(parsed.reason ?? "Your account has been suspended due to a policy violation.");
          return;
        }
      } catch {
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

  const title = { "sign-in": "Welcome back", "sign-up": "Create your account", verify: "Verify it's you", forgot: "Reset password" }[mode];
  const tagline = {
    "sign-in": "Sign in with your phone number or email.",
    "sign-up": options?.verification.sms ? "Use your real mobile number and email; we will verify both." : "Use your real mobile number and email; we will email you a code.",
    verify: "Enter the codes we just sent you.",
    forgot: resetStep === "request" ? (options?.resetChannels.sms ? "Choose where to receive a one-time code." : "We will email you a one-time code.") : "Almost done: enter the code and a new password.",
  }[mode];
  const submitLabel = { "sign-in": "Sign In", "sign-up": "Continue", verify: "Verify and create account", forgot: resetStep === "request" ? "Send code" : "Set new password" }[mode];

  // Show recovery wizard
  if (showRecovery && suspendedUserId !== null) {
    return (
      <RecoveryRequestFlow
        suspendedUserId={suspendedUserId}
        suspensionReason={suspensionReason}
        userPhone={identifier}
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
              To recover your account, submit a recovery request with identity documents. Our Trust &amp; Safety team
              reviews every request manually and replies to your registered email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container auth-split animate-fade-in">
      {/* AURA cinematic brand hero */}
      <section className="auth-hero" aria-hidden="false">
        <div className="auth-hero-brand">
          <span className="aura-tile aura-tile-sm">
            <ChatIcon size={22} />
          </span>
          <span className="auth-hero-wordmark">ELiSecureChat</span>
        </div>

        <div className="auth-hero-copy">
          <span className="auth-hero-overline">Private by design</span>
          <h2 className="auth-hero-title">
            Private conversations,
            <br />
            signed or spoken.
          </h2>
          <p className="auth-hero-sub">
            Messages, voice notes and video calls that only you and the people you talk to can read, with live captions and sign language assistance built in.
          </p>
        </div>

        <div className="auth-hero-bubbles" aria-hidden="true">
          <div className="hero-bubble in" style={{ ["--i" as string]: 0 }}>Are we still on for tonight?</div>
          <div className="hero-bubble out" style={{ ["--i" as string]: 1 }}>
            Yes, 8 pm. Sending the details now <LockIcon size={12} />
          </div>
          <div className="hero-bubble in typing" style={{ ["--i" as string]: 2 }}>
            <i />
            <i />
            <i />
          </div>
        </div>

        <ul className="auth-hero-points">
          <li>
            <span className="ahp-icon"><LockIcon size={18} /></span>
            <span><strong>End-to-end encrypted</strong>Keys stay on your devices. Not even our servers can read your chats.</span>
          </li>
          <li>
            <span className="ahp-icon"><HandIcon size={18} /></span>
            <span><strong>Built for Deaf and hearing people</strong>Live captions and sign assistance run on your device during calls.</span>
          </li>
          <li>
            <span className="ahp-icon"><ShieldIcon size={18} /></span>
            <span><strong>Verified accounts</strong>Every account confirms a real email address before it is created.</span>
          </li>
        </ul>
      </section>

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrapper">
            <ChatIcon size={30} className="auth-logo-icon" />
          </div>
          <h1>{title}</h1>
          <p className="auth-tagline">{tagline}</p>
        </div>

        {status && status !== "Ready" && !/^Sign up failed/.test(status) && (
          <div className={`auth-status-banner ${/fail|error|invalid|denied|offline|unable|wrong/i.test(status) ? "is-error" : "is-info"}`} role="status">
            {friendlyStatus(status)}
          </div>
        )}

        {mode === "sign-in" || mode === "sign-up" ? (
          <div className="auth-tabs">
            <button type="button" className={mode === "sign-in" ? "active" : ""} onClick={() => go("sign-in")}>
              Sign In
            </button>
            <button type="button" className={mode === "sign-up" ? "active" : ""} onClick={() => go("sign-up")}>
              Create Account
            </button>
          </div>
        ) : (
          <div className="auth-tabs">
            <button type="button" className="active" onClick={() => go(mode === "verify" ? "sign-up" : "sign-in")}>
              {mode === "verify" ? "← Change details" : "← Back to Sign In"}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {notice && (
            <div className={`auth-status-banner ${notice.ok ? "is-info" : "is-error"}`} role="status">
              {notice.text}
            </div>
          )}

          {/* ---------------- sign in ---------------- */}
          {mode === "sign-in" && (
            <>
              <div className="input-group">
                <label htmlFor="phone-input">Phone number or email</label>
                <input id="phone-input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="98765 43210 or you@gmail.com" autoComplete="username" required />
              </div>
              <div className="input-group">
                <label htmlFor="pwd-input">Password</label>
                <input id="pwd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
              </div>
              <div className="auth-forgot-row">
                <button type="button" className="auth-link-btn" onClick={() => go("forgot")}>
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {/* ---------------- sign up: details ---------------- */}
          {mode === "sign-up" && (
            <>
              <div className="input-group">
                <label htmlFor="name-input">Full name</label>
                <input id="name-input" value={name} onChange={(e) => edit("name", setName)(e.target.value)} placeholder="Riya Sharma" autoComplete="name" required />
                {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              </div>
              <PhoneField
                id="signup-phone"
                value={phone}
                onChange={edit("phone", setPhone)}
                error={fieldErrors.phone}
                hint={options?.verification.sms ? "We will text a code to this number to verify it." : undefined}
              />
              <div className="input-group">
                <label htmlFor="email-input">Email</label>
                <input id="email-input" type="email" value={email} onChange={(e) => edit("email", setEmail)(e.target.value)} placeholder="you@gmail.com" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
                {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : <p className="field-hint">We will email you a code to confirm it.</p>}
              </div>
              <PasswordField id="pwd-input" label="Create password" value={password} onChange={edit("password", setPassword)} context={{ name, phone: phoneE164(phone) ?? "", email }} />
              {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
              <div className="input-group">
                <label htmlFor="pwd2-input">Confirm password</label>
                <input id="pwd2-input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
                {password2 && password2 !== password && <p className="field-error">The passwords do not match.</p>}
              </div>
            </>
          )}

          {/* ---------------- sign up: verify codes ---------------- */}
          {mode === "verify" && pending && (
            <>
              <p className="auth-verify-lead">
                We sent a 6-digit code to <strong>{pending.email}</strong>
                {pending.channels.sms && (
                  <>
                    {" "}and by SMS to <strong>{pending.phone}</strong>
                  </>
                )}
                . Codes are valid for {pending.codeMinutes} minutes.
              </p>
              <OtpInput id="email-code" label={`Email code (${pending.email})`} value={emailCode} onChange={edit("email", setEmailCode)} autoFocus />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
              <div className="auth-resend-row">
                <ResendButton seconds={pending.resendAfterSeconds} onResend={() => resend("email")} label="Resend email code" />
              </div>
              {pending.channels.sms && (
                <>
                  <OtpInput id="sms-code" label={`SMS code (${pending.phone})`} value={smsCode} onChange={edit("sms", setSmsCode)} />
                  {fieldErrors.sms && <p className="field-error">{fieldErrors.sms}</p>}
                  <div className="auth-resend-row">
                    <ResendButton seconds={pending.resendAfterSeconds} onResend={() => resend("sms")} label="Resend SMS" />
                  </div>
                </>
              )}
              <p className="field-hint">Didn't get the email? Check Spam or Promotions, or tap "Change details" to fix the address.</p>
            </>
          )}

          {/* ---------------- forgot password ---------------- */}
          {mode === "forgot" && (
            <>
              {resetStep === "request" && (
                <>
                  {options?.resetChannels.sms && (
                  <div className="reset-channels" role="radiogroup" aria-label="Where should we send the code?">
                    <button type="button" role="radio" aria-checked={resetChannel === "email"} className={resetChannel === "email" ? "active" : ""} disabled={!options?.resetChannels.email} onClick={() => setResetChannel("email")}>
                      ✉️ Email
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={resetChannel === "sms"}
                      className={resetChannel === "sms" ? "active" : ""}
                      disabled={!options?.resetChannels.sms}
                      onClick={() => setResetChannel("sms")}
                      title={options?.resetChannels.sms ? "" : "SMS is not available on this server yet"}
                    >
                      💬 SMS
                    </button>
                  </div>
                  )}
                  {resetChannel === "email" ? (
                    <div className="input-group">
                      <label htmlFor="reset-email">Your account email</label>
                      <input id="reset-email" type="email" value={resetIdentifier} onChange={(e) => setResetIdentifier(e.target.value)} placeholder="you@gmail.com" autoComplete="email" required />
                    </div>
                  ) : (
                    <PhoneField id="reset-phone" value={resetPhone} onChange={setResetPhone} />
                  )}
                </>
              )}
              {resetStep === "confirm" && (
                <>
                  <p className="auth-verify-lead">
                    If an account matches, we sent a 6-digit code by {resetChannel === "email" ? "email" : "SMS"}. Enter it and choose a new password.
                  </p>
                  <OtpInput id="reset-code" label="6-digit code" value={code} onChange={setCode} autoFocus />
                  <div className="auth-resend-row">
                    <ResendButton seconds={60} onResend={() => sendResetCode(true)} />
                  </div>
                  <PasswordField id="pwd-input" label="New password" value={password} onChange={setPassword} />
                  <div className="input-group">
                    <label htmlFor="pwd2-input">Confirm new password</label>
                    <input id="pwd2-input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
                    {password2 && password2 !== password && <p className="field-error">The passwords do not match.</p>}
                  </div>
                </>
              )}
            </>
          )}

          <button type="submit" className="btn btn-primary btn-block btn-cta" disabled={!backendReady || loading || !canSubmit}>
            {loading ? "Please wait..." : submitLabel}
            {!loading && <span className="btn-arrow" aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="auth-safety-note">
          <ShieldIcon size={14} /> We will never ask for your code by call, SMS or email.
        </p>
        <div className="auth-footer-stats">
          <div className="stat-indicator">
            <span className={`indicator-dot ${backendReady ? "active" : "inactive"}`} />
            <span>{backendReady ? "Secure server connected" : "Server offline"}</span>
          </div>
          <span className="auth-legal">© 2026 EliSecureChat · Privacy · Terms · Accessibility</span>
        </div>
      </div>
    </div>
  );
}
