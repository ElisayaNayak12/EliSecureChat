import { useState } from "react";
import { LockIcon, InfoIcon, TrashIcon } from "../components/Icons";
import type { Appearance, PreferencesPatch, UserPreferences, WallpaperId } from "../types";
import { ACCENTS, DESIGNS, WALLPAPERS } from "../theme";
import LanguageAccessibilitySettings from "./LanguageAccessibilitySettings";
import SecuritySettings from "./SecuritySettings";

interface SettingsPanelProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  chatWallpaper: WallpaperId;
  setChatWallpaper: (val: WallpaperId) => void;
  appearance: Appearance;
  onUpdateAppearance: (patch: Partial<Appearance>) => void;
  onNavigateToProfile: () => void;
  customWallpaper: string | null;
  onCustomWallpaperChange: (url: string | null) => void;
  onDeleteAccount: () => Promise<void>;
  preferences: UserPreferences | null;
  onUpdatePreferences: (patch: PreferencesPatch) => Promise<void>;
  backendReady: boolean;
}

export default function SettingsPanel({
  theme,
  onToggleTheme,
  chatWallpaper,
  setChatWallpaper,
  appearance,
  onUpdateAppearance,
  onNavigateToProfile,
  customWallpaper,
  onCustomWallpaperChange,
  onDeleteAccount,
  preferences,
  onUpdatePreferences,
  backendReady,
}: SettingsPanelProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCustomWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        onCustomWallpaperChange(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="settings-panel-container animate-fade-in">
      <div className="panel-header">
        <h2>Settings</h2>
      </div>

      <div className="scroll-container settings-list-scroll">
        {/* Profile Navigation Shortcut */}
        <div className="settings-section">
          <h3>My Profile</h3>
          <div className="settings-card-clickable" onClick={onNavigateToProfile}>
            <div className="settings-card-clickable-main">
              <strong>Account Profile Details</strong>
              <span>Update display name, contact email, or upload a custom avatar.</span>
            </div>
            <span className="arrow-right-indicator">→</span>
          </div>
        </div>

        <LanguageAccessibilitySettings
          preferences={preferences}
          onUpdatePreferences={onUpdatePreferences}
          backendReady={backendReady}
        />

        {/* Appearance: 5 designs, light/dark, accent, bubbles, wallpaper */}
        <div className="settings-section appearance-section">
          <h3>Appearance</h3>
          <div className="settings-card">
            <div className={`appearance-preview wallpaper-${chatWallpaper}`} style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} aria-label="Live preview">
              <div className="message-bubble bubble-incoming"><span className="message-plain-text">Good morning! Shall we meet at 10?</span></div>
              <div className="message-bubble bubble-mine"><span className="message-plain-text">Yes, see you there 👋</span></div>
            </div>

            <div className="appearance-row">
              <div className="setting-label-col"><strong>Mode</strong><span>Light or dark backgrounds.</span></div>
              <div className="seg" role="radiogroup" aria-label="Mode">
                {(["light", "dark"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={theme === m} className={theme === m ? "on" : ""} onClick={() => theme !== m && onToggleTheme()}>
                    {m === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>

            <div className="appearance-block">
              <div className="setting-label-col"><strong>Design</strong><span>Choose one of five looks. Each has a light and a dark version.</span></div>
              <div className="design-grid" role="radiogroup" aria-label="Design">
                {DESIGNS.map((d) => (
                  <button key={d.id} type="button" role="radio" aria-checked={appearance.design === d.id} className={`design-card ${appearance.design === d.id ? "active" : ""}`} onClick={() => onUpdateAppearance({ design: d.id })}>
                    <span className="design-swatch" style={{ background: `linear-gradient(135deg, ${d.swatch[0]} 0 45%, ${d.swatch[1]} 45% 70%, ${d.swatch[2]} 70%)` }} />
                    <strong>{d.name}</strong>
                    <small>{d.blurb}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="appearance-row">
              <div className="setting-label-col"><strong>Accent colour</strong><span>Colour of your bubbles and highlights.</span></div>
              <div className="accent-row" role="radiogroup" aria-label="Accent colour">
                <button type="button" role="radio" aria-checked={appearance.accent === null} className={`accent-dot accent-auto ${appearance.accent === null ? "active" : ""}`} onClick={() => onUpdateAppearance({ accent: null })} title="Design default">Auto</button>
                {ACCENTS.map((a) => (
                  <button key={a.id} type="button" role="radio" aria-checked={appearance.accent === a.id} aria-label={a.name} title={a.name} className={`accent-dot ${appearance.accent === a.id ? "active" : ""}`} style={{ background: a.color }} onClick={() => onUpdateAppearance({ accent: a.id })} />
                ))}
              </div>
            </div>

            <div className="appearance-row">
              <div className="setting-label-col"><strong>Message bubbles</strong><span>Rounded and roomy, or compact.</span></div>
              <div className="seg" role="radiogroup" aria-label="Message bubbles">
                {(["rounded", "compact"] as const).map((b) => (
                  <button key={b} type="button" role="radio" aria-checked={appearance.bubbles === b} className={appearance.bubbles === b ? "on" : ""} onClick={() => onUpdateAppearance({ bubbles: b })}>
                    {b === "rounded" ? "Rounded" : "Compact"}
                  </button>
                ))}
              </div>
            </div>

            <div className="appearance-block">
              <div className="setting-label-col"><strong>Chat wallpaper</strong><span>Background behind your messages.</span></div>
              <div className="wallpaper-selectors-grid" role="radiogroup" aria-label="Chat wallpaper">
                {WALLPAPERS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="radio"
                    aria-checked={!customWallpaper && chatWallpaper === w.id}
                    className={`wallpaper-select-btn wallpaper-${w.id} ${!customWallpaper && chatWallpaper === w.id ? "active" : ""}`}
                    onClick={() => {
                      onCustomWallpaperChange(null);
                      setChatWallpaper(w.id);
                    }}
                    title={w.name}
                    aria-label={w.name}
                  >
                    <span>{w.name}</span>
                  </button>
                ))}
                <label className={`wallpaper-select-btn wallpaper-upload ${customWallpaper ? "active" : ""}`} title="Use my photo">
                  <span>{customWallpaper ? "My photo" : "+ My photo"}</span>
                  <input type="file" accept="image/*" onChange={handleCustomWallpaperUpload} style={{ display: "none" }} />
                </label>
              </div>
              {customWallpaper && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => onCustomWallpaperChange(null)}>
                  Remove my photo
                </button>
              )}
            </div>
          </div>
        </div>

        <SecuritySettings backendReady={backendReady} />

        {/* Security Settings */}
        <div className="settings-section">
          <h3>Security &amp; Privacy</h3>
          <div className="settings-card">
            <div className="security-status-indicator">
              <LockIcon size={24} className="text-accent" />
              <div>
                <strong>Messages are end-to-end encrypted</strong>
                <span>New messages are encrypted on your device for each recipient device and signed, so the server cannot read or alter them. Verify a contact's security code in their chat info. Photos and files are not end-to-end encrypted yet. Messages from before encryption was turned on remain readable by the server.</span>
              </div>
            </div>

            <div className="settings-info-item">
              <InfoIcon size={16} />
              <span>
                <strong>Read Receipts:</strong> Receipts automatically fire to log Sent, Delivered and Read states.
              </span>
            </div>

            <div className="settings-info-item">
              <InfoIcon size={16} />
              <span>
                <strong>Mutual Erasure Protocol:</strong> Members must mutually confirm chat delete requests before histories are purged.
              </span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section">
          <h3 style={{ color: "var(--color-danger, #ef4444)" }}>Danger Zone</h3>
          <div
            className="settings-card"
            style={{
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.05)",
            }}
          >
            <div className="setting-row">
              <div className="setting-label-col">
                <strong style={{ color: "var(--color-danger, #ef4444)" }}>Delete My Account</strong>
                <span>
                  Permanently erase your account, all messages, chats, and profile data. This cannot be undone.
                </span>
              </div>
              <button
                id="settings-delete-account-btn"
                className="btn btn-danger btn-sm btn-icon-label"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                style={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {isDeleting ? (
                  "Deleting…"
                ) : (
                  <>
                    <TrashIcon size={14} /> Delete Account
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
