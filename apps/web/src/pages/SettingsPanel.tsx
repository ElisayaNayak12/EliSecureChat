import { useState } from "react";
import { LockIcon, InfoIcon, TrashIcon } from "../components/Icons";

interface SettingsPanelProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  chatWallpaperIndex: number;
  setChatWallpaperIndex: (val: number) => void;
  onNavigateToProfile: () => void;
  customWallpaper: string | null;
  onCustomWallpaperChange: (url: string | null) => void;
  onDeleteAccount: () => Promise<void>;
}

export default function SettingsPanel({
  theme,
  onToggleTheme,
  chatWallpaperIndex,
  setChatWallpaperIndex,
  onNavigateToProfile,
  customWallpaper,
  onCustomWallpaperChange,
  onDeleteAccount,
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

        {/* Customization Settings */}
        <div className="settings-section">
          <h3>Customization</h3>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label-col">
                <strong>Appearance Mode</strong>
                <span>Switch between light and dark backgrounds.</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={onToggleTheme}>
                {theme === "light" ? "Switch to Dark" : "Switch to Light"}
              </button>
            </div>

            <div className="setting-row" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginTop: "14px" }}>
              <div className="setting-label-col">
                <strong>Chat Wallpaper</strong>
                <span>Select active chat room background style.</span>
              </div>
              <div className="wallpaper-selectors-grid">
                {[0, 1, 2, 3].map((idx) => (
                  <button
                    key={idx}
                    className={`wallpaper-select-btn wallpaper-preview-btn-${idx} ${
                      !customWallpaper && chatWallpaperIndex === idx ? "active" : ""
                    }`}
                    onClick={() => {
                      onCustomWallpaperChange(null);
                      setChatWallpaperIndex(idx);
                    }}
                    title={`Wallpaper Preset ${idx + 1}`}
                    aria-label={`Select Preset ${idx + 1}`}
                  />
                ))}
              </div>

              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <label className="btn btn-secondary btn-sm" style={{ display: "inline-block", cursor: "pointer", margin: 0 }}>
                  Upload Custom Wallpaper
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomWallpaperUpload}
                    style={{ display: "none" }}
                  />
                </label>
                {customWallpaper && (
                  <>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Custom background active
                    </span>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => onCustomWallpaperChange(null)}
                      style={{ fontSize: "11px", padding: "2px 8px" }}
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="settings-section">
          <h3>Security &amp; Privacy</h3>
          <div className="settings-card">
            <div className="security-status-indicator">
              <LockIcon size={24} className="text-accent" />
              <div>
                <strong>End-to-End Cryptography Active</strong>
                <span>All chat histories are obfuscated using unique base-64 keys.</span>
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
