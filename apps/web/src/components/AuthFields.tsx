import { useEffect, useMemo, useRef, useState } from "react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/* ------------------------------------------------------------------ phone ------------------------------------------------------------------ */

const flag = (cc: string) => cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export type PhoneValue = { country: CountryCode; number: string };

/** International number (+919876543210) when valid, else null. The server re-checks (including "is it a mobile"). */
export function phoneE164(v: PhoneValue): string | null {
  const p = parsePhoneNumberFromString(v.number, v.country);
  return p && p.isValid() ? p.number : null;
}

export function PhoneField({ id, value, onChange, error, autoFocus, hint = "Must be a real mobile number. You can sign in with it." }: { id: string; value: PhoneValue; onChange: (v: PhoneValue) => void; error?: string; autoFocus?: boolean; hint?: string }) {
  const countries = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      /* old browser: show codes only */
    }
    return getCountries()
      .map((cc) => ({ cc, name: names?.of(cc) ?? cc, dial: getCountryCallingCode(cc) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const [touched, setTouched] = useState(false);
  const e164 = phoneE164(value);
  const shownError = error ?? (touched && value.number.trim() && !e164 ? "This number is not valid for the selected country." : undefined);
  const onBlur = () => {
    setTouched(true);
    const p = parsePhoneNumberFromString(value.number, value.country);
    // "+44 7700 900123" typed into the field switches the country automatically.
    // Shown without the country code (it is in the selector) and without a trunk "0": "98765 43210".
    if (p?.isValid()) onChange({ country: (p.country ?? value.country) as CountryCode, number: p.formatInternational().replace(/^\+\d+\s*/, "") });
  };
  return (
    <div className="input-group">
      <label htmlFor={id}>Mobile number</label>
      <div className={`phone-field ${shownError ? "has-error" : e164 ? "is-valid" : ""}`}>
        <select aria-label="Country" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value as CountryCode })}>
          {countries.map((c) => (
            <option key={c.cc} value={c.cc}>
              {flag(c.cc)} {c.name} (+{c.dial})
            </option>
          ))}
        </select>
        <span className="phone-dial" aria-hidden="true">+{getCountryCallingCode(value.country)}</span>
        <input
          id={id}
          value={value.number}
          onChange={(e) => onChange({ ...value, number: e.target.value.replace(/[^\d\s()+-]/g, "") })}
          onBlur={onBlur}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98765 43210"
          autoFocus={autoFocus}
          aria-invalid={!!shownError}
          required
        />
        {e164 && !shownError && <span className="field-ok" aria-label="Valid number">✓</span>}
      </div>
      {shownError ? <p className="field-error">{shownError}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- password ---------------------------------------------------------------- */

const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "11111111", "00000000", "abc12345", "abcd1234", "admin123", "welcome1", "letmein1", "passw0rd", "india123", "test1234", "asdf1234", "1q2w3e4r", "sunshine1"]);

/** Same rules as the server (apps/backend/src/auth/contact.ts). */
export function passwordProblem(pw: string, ctx: { name?: string; phone?: string; email?: string } = {}): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use both letters and numbers.";
  if (/^(.)\1+$/.test(pw)) return "Do not repeat one character.";
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common.";
  const digits = (ctx.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 6 && lower.includes(digits.slice(-6))) return "Do not use your phone number.";
  const local = (ctx.email ?? "").split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Do not use your email address.";
  const first = (ctx.name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower.includes(first)) return "Do not use your name.";
  return null;
}

function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (COMMON.has(pw.toLowerCase()) || pw.length < 8) s = Math.min(s, 1);
  const score = Math.max(1, Math.min(4, s)) as 1 | 2 | 3 | 4;
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  context,
  showRules = true,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  context?: { name?: string; phone?: string; email?: string };
  showRules?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const st = strength(value);
  const rules = [
    { ok: value.length >= 8, text: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(value) && /\d/.test(value), text: "Letters and numbers" },
    { ok: value.length > 0 && !passwordProblem(value, context), text: "Not common, not your name, phone or email" },
  ];
  return (
    <div className="input-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input id={id} type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder="••••••••" required />
        <button type="button" className="password-toggle" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {showRules && (
        <>
          <div className="pw-meter" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={i <= st.score ? `on s${st.score}` : ""} />
            ))}
          </div>
          {value && <p className={`pw-label s${st.score}`}>Strength: {st.label}</p>}
          <ul className="pw-rules">
            {rules.map((r) => (
              <li key={r.text} className={r.ok ? "ok" : ""}>
                {r.ok ? "✓" : "•"} {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- one-time code ------------------------------------------------------------- */

/** Six boxes; paste of a whole code fills all of them; works with SMS autofill (autocomplete="one-time-code"). */
export function OtpInput({ id, value, onChange, label, autoFocus, disabled }: { id: string; value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);
  // Digits fill left to right (like WhatsApp): typing into a later empty box writes at the first empty position.
  const set = (i: number, d: string) => {
    if (!d) {
      onChange(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    const pos = Math.min(i, value.length);
    onChange((value.slice(0, pos) + d + value.slice(pos + 1)).slice(0, 6));
    refs.current[Math.min(5, pos + 1)]?.focus();
  };
  return (
    <div className="input-group">
      <label htmlFor={`${id}-0`}>{label}</label>
      <div className="otp-boxes" role="group" aria-label={label}>
        {Array.from({ length: 6 }, (_, i) => (
          <input
            key={i}
            id={`${id}-${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="otp-box"
            value={value[i] ?? ""}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              if (digits.length > 1) {
                onChange(digits.slice(0, 6)); // pasted or autofilled the whole code
                refs.current[Math.min(5, digits.length - 1)]?.focus();
                return;
              }
              set(i, digits);
            }}
            onFocus={() => {
              if (i > value.length) refs.current[value.length]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** "Resend code" with a countdown. */
export function ResendButton({ seconds, onResend, label = "Resend code" }: { seconds: number; onResend: () => Promise<void>; label?: string }) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return (
    <button
      type="button"
      className="auth-link-btn"
      disabled={left > 0 || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setLeft(60);
        } finally {
          setBusy(false);
        }
      }}
    >
      {left > 0 ? `${label} in ${left}s` : busy ? "Sending..." : label}
    </button>
  );
}

/** The server's error text ("message" from JSON bodies) plus the field it refers to. */
export function readError(err: unknown): { message: string; field?: string } {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const b = JSON.parse(raw);
    const m = Array.isArray(b.message) ? b.message.join(", ") : String(b.message ?? raw);
    return { message: m, field: typeof b.field === "string" ? b.field : undefined };
  } catch {
    return { message: raw };
  }
}
