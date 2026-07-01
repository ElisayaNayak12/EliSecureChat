import { useState, useMemo } from "react";
import Avatar from "../components/Avatar";
import { SearchIcon, RefreshIcon, ChatIcon } from "../components/Icons";
import type { User } from "../types";

interface ContactsPanelProps {
  contacts: User[];
  onStartChat: (peer: User) => void;
  onRefresh: () => void;
  backendReady: boolean;
  resolveUrl: (url?: string) => string;
  formatLastSeen: (time?: string) => string;
}

export default function ContactsPanel({
  contacts,
  onStartChat,
  onRefresh,
  backendReady,
  resolveUrl,
  formatLastSeen,
}: ContactsPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((u) => {
      return (
        u.name.toLowerCase().includes(needle) ||
        u.phone.includes(needle) ||
        (u.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [contacts, query]);

  return (
    <div className="contacts-panel-container animate-fade-in">
      <div className="panel-header">
        <h2>Contacts</h2>
        <button
          className="btn-icon"
          onClick={onRefresh}
          disabled={!backendReady}
          title="Refresh contacts"
          aria-label="Refresh contacts"
        >
          <RefreshIcon size={18} />
        </button>
      </div>

      <div className="search-bar-container">
        <SearchIcon size={18} className="search-bar-icon" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone or email..."
          className="search-input"
        />
      </div>

      <div className="scroll-container contacts-list-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state-box">
            <h3>No contacts found</h3>
            <p>Try refining your search query or refresh the list.</p>
          </div>
        ) : (
          <ul className="contacts-cards-grid">
            {filtered.map((u) => (
              <li key={u.id} className="contact-card-wrapper animate-slide-up">
                <div className="contact-card-header">
                  <Avatar
                    name={u.name}
                    avatarUrl={u.avatarUrl}
                    size="md"
                    resolveUrl={resolveUrl}
                  />
                  <div className="contact-card-meta">
                    <span className="contact-card-name">{u.name}</span>
                    <span className="contact-card-status">{formatLastSeen(u.lastSeenAt)}</span>
                  </div>
                </div>
                <div className="contact-card-details">
                  {u.email && (
                    <div className="detail-item">
                      <span className="detail-label">Email:</span>
                      <span className="detail-value">{u.email}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="detail-label">Phone:</span>
                    <span className="detail-value">{u.phone}</span>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => onStartChat(u)}>
                  <ChatIcon size={14} style={{ marginRight: "6px", display: "inline-block" }} /> Start Chat
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
