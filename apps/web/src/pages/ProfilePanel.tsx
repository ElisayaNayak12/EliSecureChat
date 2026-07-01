import { useState, useEffect } from "react";
import Avatar from "../components/Avatar";
import { LogOutIcon, ShieldIcon, CameraIcon, TrashIcon } from "../components/Icons";
import type { User } from "../types";

interface ProfilePanelProps {
  currentUser: User;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
  onSaveProfile: (name: string, email: string, avatarFile: File | null) => Promise<void>;
  backendReady: boolean;
  resolveUrl: (url?: string) => string;
}

export default function ProfilePanel({
  currentUser,
  onSignOut,
  onDeleteAccount,
  onSaveProfile,
  backendReady,
  resolveUrl,
}: ProfilePanelProps) {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(currentUser.name);
    setEmail(currentUser.email ?? "");
    setFile(null);
    setPreviewUrl(null);
  }, [currentUser]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !backendReady) return;
    setLoading(true);
    try {
      await onSaveProfile(name.trim(), email.trim(), file);
      setFile(null);
      setPreviewUrl(null);
    } finally {
      setLoading(false);
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
    <div className="profile-panel-container animate-fade-in">
      <div className="panel-header">
        <h2>My Profile</h2>
        <div className="header-actions">
          <button
            id="profile-delete-account-btn"
            className="btn btn-danger btn-sm btn-icon-label"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            title="Permanently delete your account"
          >
            <TrashIcon size={14} /> {isDeleting ? "Deleting…" : "Delete Account"}
          </button>
          <button className="btn btn-secondary btn-sm btn-icon-label" onClick={onSignOut}>
            <LogOutIcon size={14} /> Sign Out
          </button>
        </div>
      </div>

      <div className="scroll-container profile-panel-scroll">
        <form onSubmit={handleSave} className="profile-edit-form">
          <div className="profile-avatar-section">
            <div className="profile-avatar-preview-wrapper">
              {previewUrl ? (
                <img className="profile-avatar-preview-img" src={previewUrl} alt="Avatar preview" />
              ) : (
                <Avatar
                  name={currentUser.name}
                  avatarUrl={currentUser.avatarUrl}
                  size="xl"
                  resolveUrl={resolveUrl}
                />
              )}
              <label className="profile-avatar-upload-overlay" htmlFor="avatar-file-input">
                <CameraIcon size={24} />
                <input
                  id="avatar-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </label>
            </div>
            <h3>{currentUser.name}</h3>
            <p className="profile-avatar-tagline">Logged in as {currentUser.phone}</p>
          </div>

          <div className="profile-inputs-grid">
            <div className="input-group">
              <label htmlFor="display-name">Display Name</label>
              <input
                id="display-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display Name"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="display-email">Email Address</label>
              <input
                id="display-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>

            <div className="input-group">
              <label>Phone Number</label>
              <input type="text" value={currentUser.phone} disabled className="disabled-field" />
              <small className="help-text">Phone numbers are immutable for authentication.</small>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={!backendReady || loading}>
              {loading ? "Saving Profile Changes..." : "Save Profile Details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
