import { useState } from "react";
import Dialog from "../components/Dialog";
import { PlusIcon, LockIcon, GroupIcon } from "../components/Icons";
import type { Community } from "../types";

interface CommunitiesPanelProps {
  communities: Community[];
  onCreateCommunity: (name: string, desc: string, privacy: "PUBLIC" | "PRIVATE") => Promise<void>;
  backendReady: boolean;
}

export default function CommunitiesPanel({
  communities,
  onCreateCommunity,
  backendReady,
}: CommunitiesPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !backendReady) return;
    setLoading(true);
    try {
      await onCreateCommunity(name.trim(), desc.trim(), privacy);
      setName("");
      setDesc("");
      setPrivacy("PUBLIC");
      setIsModalOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="communities-panel-container animate-fade-in">
      <div className="panel-header">
        <h2>Communities</h2>
        <button
          className="btn btn-primary btn-sm btn-icon-label"
          onClick={() => setIsModalOpen(true)}
          disabled={!backendReady}
        >
          <PlusIcon size={16} /> Create Community
        </button>
      </div>

      <div className="scroll-container communities-list-scroll">
        {communities.length === 0 ? (
          <div className="empty-state-box">
            <h3>No communities yet</h3>
            <p>Create a public or private community space to start group conversations.</p>
          </div>
        ) : (
          <ul className="communities-grid">
            {communities.map((c) => (
              <li key={c.id} className="community-card animate-slide-up">
                <div className="community-card-icon">
                  <GroupIcon size={24} />
                </div>
                <div className="community-card-body">
                  <div className="community-card-row">
                    <span className="community-name">{c.name}</span>
                    <span className={`privacy-badge ${c.privacy.toLowerCase()}`}>
                      {c.privacy === "PRIVATE" && <LockIcon size={10} style={{ marginRight: "2px" }} />}
                      {c.privacy}
                    </span>
                  </div>
                  {c.description && <p className="community-description">{c.description}</p>}
                  <div className="community-card-footer">
                    {c.inviteCode && (
                      <span className="invite-code-tag">Invite Code: <code>{c.inviteCode}</code></span>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => alert("Group chat integration will be loaded in the next release.")}
                    >
                      Join Community
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Community">
        <form onSubmit={handleSubmit} className="community-form">
          <div className="input-group">
            <label htmlFor="comm-name">Community Name</label>
            <input
              id="comm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Developer Network"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="comm-desc">Description</label>
            <input
              id="comm-desc"
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this community about?"
            />
          </div>

          <div className="input-group">
            <label htmlFor="comm-privacy">Privacy Setting</label>
            <select
              id="comm-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as "PUBLIC" | "PRIVATE")}
              className="select-field"
            >
              <option value="PUBLIC">Public (Visible to everyone)</option>
              <option value="PRIVATE">Private (Invite only)</option>
            </select>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!backendReady || loading}>
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
