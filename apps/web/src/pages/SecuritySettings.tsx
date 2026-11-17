import { useEffect, useState } from "react";
import { api } from "../api";
import type { DeviceSessionInfo } from "../types";

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function errorText(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const b = JSON.parse(raw);
    return String(b.message ?? raw);
  } catch {
    return raw;
  }
}

/** Signed-in devices (remote sign-out) and password change. */
export default function SecuritySettings({ backendReady }: { backendReady: boolean }) {
  const [sessions, setSessions] = useState<DeviceSessionInfo[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .listSessions()
      .then((s) => setSessions(s.sort((a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.localeCompare(a.lastUsedAt))))
      .catch((e) => setMsg({ ok: false, text: errorText(e) }));

  useEffect(() => {
    if (backendReady) void load();
  }, [backendReady]);

  const revoke = async (id: string) => {
    try {
      await api.revokeSession(id);
      setMsg({ ok: true, text: "That device has been signed out." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const revokeOthers = async () => {
    try {
      await api.revokeOtherSessions();
      setMsg({ ok: true, text: "All other devices have been signed out." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const changePassword = async () => {
    if (pw.next.length < 8) {
      setMsg({ ok: false, text: "The new password must be at least 8 characters." });
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "" });
      setMsg({ ok: true, text: "Password changed. Your other devices were signed out." });
      await load();
    } catch (e) {
      const t = errorText(e);
      setMsg({ ok: false, text: /WRONG_PASSWORD/.test(t) ? "The current password is not correct." : t });
    } finally {
      setBusy(false);
    }
  };

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <div className="settings-section">
      <h3>Devices &amp; password</h3>
      <div className="settings-card pref-rows">
        {msg && <p className={msg.ok ? "ts-msg" : "pref-error-inline"} role="status">{msg.text}</p>}
        <div className="setting-row">
          <div className="setting-label-col">
            <strong>Where you're signed in</strong>
            <span>Sign out any device you don't recognise.</span>
          </div>
        </div>
        <div className="sec-sessions">
          {sessions === null && <p className="ts-footnote">Loading…</p>}
          {sessions?.map((s) => (
            <div key={s.id} className="sec-session">
              <div>
                <strong>{s.device}{s.current ? " · this device" : ""}</strong>
                <span>Active {ago(s.lastUsedAt)} · signed in {new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              {!s.current && <button className="btn btn-ghost btn-xs" onClick={() => void revoke(s.id)}>Sign out</button>}
            </div>
          ))}
        </div>
        {others > 0 && (
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>Sign out everywhere else</strong>
              <span>{others} other device{others === 1 ? "" : "s"}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => void revokeOthers()}>Sign out others</button>
          </div>
        )}
        <div className="setting-row sec-password">
          <div className="setting-label-col">
            <strong>Change password</strong>
            <span>At least 8 characters. Other devices are signed out.</span>
          </div>
          <div className="sec-password-fields">
            <input type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} aria-label="Current password" />
            <input type="password" autoComplete="new-password" placeholder="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} aria-label="New password" />
            <button className="btn btn-primary btn-sm" disabled={busy || !pw.current || !pw.next} onClick={() => void changePassword()}>Change</button>
          </div>
        </div>
      </div>
    </div>
  );
}
