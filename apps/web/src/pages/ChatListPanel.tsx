import { useState } from "react";
import Avatar from "../components/Avatar";
import { SearchIcon, RefreshIcon } from "../components/Icons";
import type { ChatSummary, User } from "../types";

interface ChatListPanelProps {
  summaries: ChatSummary[];
  contacts: User[];
  search: string;
  setSearch: (val: string) => void;
  onOpenChat: (summary: ChatSummary) => void;
  onStartChat: (peer: User) => void;
  activeChatId: string | null;
  onlineUsers: Set<string>;
  backendReady: boolean;
  onRefresh: () => void;
  resolveUrl: (url?: string) => string;
  formatChatTime: (time?: string) => string;
  messageSnippet: (text: string, fileName?: string) => string;
  decryptMessage: (content: string) => string;
}

export default function ChatListPanel({
  summaries,
  contacts,
  search,
  setSearch,
  onOpenChat,
  onStartChat,
  activeChatId,
  onlineUsers,
  backendReady,
  onRefresh,
  resolveUrl,
  formatChatTime,
  messageSnippet,
  decryptMessage,
}: ChatListPanelProps) {
  const [filter, setFilter] = useState<"all" | "unread" | "direct" | "groups">("all");
  const unreadChats = summaries.filter((s) => s.unreadCount > 0).length;
  const shown = summaries.filter((s) =>
    filter === "unread" ? s.unreadCount > 0 : filter === "groups" ? s.chat.type === "COMMUNITY" : filter === "direct" ? s.chat.type === "ONE_TO_ONE" : true,
  );
  return (
    <div className="chats-list-panel animate-fade-in">
      <div className="panel-header">
        <div className="panel-header-titles">
          <h2>Chats</h2>
          <span className="panel-header-sub">
            {summaries.length} conversation{summaries.length === 1 ? "" : "s"}
            {(() => {
              const unread = summaries.reduce((n, s) => n + (s.unreadCount > 0 ? 1 : 0), 0);
              return unread > 0 ? ` · ${unread} unread` : "";
            })()}
          </span>
        </div>
        <button
          className="btn-icon"
          onClick={onRefresh}
          disabled={!backendReady}
          title="Refresh Chats"
          aria-label="Refresh Chats"
        >
          <RefreshIcon size={18} />
        </button>
      </div>

      <div className="search-bar-container">
        <SearchIcon size={18} className="search-bar-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="search-input"
        />
      </div>

      <div className="scroll-container chat-sidebar-scroll">
        <div className="sidebar-section quick-contacts-section">
          <h3>Quick start</h3>
          {contacts.length === 0 ? (
            <div className="empty-sidebar-state">No matching contacts</div>
          ) : (
            <ul className="chat-contacts-list">
              {contacts.map((u) => {
                const isUserOnline = onlineUsers.has(u.id);
                return (
                  <li key={u.id} className="chat-contact-item-wrapper">
                    <button className="chat-contact-item" onClick={() => onStartChat(u)}>
                      <Avatar
                        name={u.name}
                        avatarUrl={u.avatarUrl}
                        size="lg"
                        isOnline={isUserOnline}
                        resolveUrl={resolveUrl}
                      />
                      <span className="chat-contact-name">{u.name.split(" ")[0]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="chat-filters" role="tablist" aria-label="Filter chats">
          {([
            ["all", "All"],
            ["unread", unreadChats ? `Unread ${unreadChats}` : "Unread"],
            ["direct", "People"],
            ["groups", "Groups"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar-section">
          <h3>Recent</h3>
          {shown.length === 0 ? (
            <div className="empty-sidebar-state">{summaries.length === 0 ? "No conversations yet" : "No chats in this filter"}</div>
          ) : (
            <ul className="chat-summary-list">
              {shown.map((s, idx) => {
                const title = s.peer?.name ?? s.chat.title ?? "Chat";
                const isSelected = s.chat.id === activeChatId;
                const isPeerOnline = s.peer ? onlineUsers.has(s.peer.id) : false;
                const plainText = s.lastMessage ? decryptMessage(s.lastMessage.encryptedContent) : "";
                const preview = s.lastMessage
                  ? messageSnippet(plainText, s.lastMessage.fileName)
                  : "No messages yet";

                return (
                  <li
                    key={s.chat.id}
                    className={`chat-summary-item-wrapper ${isSelected ? "selected" : ""} ${s.unreadCount > 0 ? "has-unread" : ""}`}
                    style={{ ["--i" as string]: Math.min(idx, 8) }}
                  >
                    <button className="chat-summary-item" onClick={() => onOpenChat(s)}>
                      <Avatar
                        name={title}
                        avatarUrl={s.peer?.avatarUrl}
                        size="md"
                        isOnline={s.peer ? isPeerOnline : undefined}
                        resolveUrl={resolveUrl}
                      />
                      <div className="chat-summary-details">
                        <div className="chat-summary-row">
                          <span className="chat-summary-name">{title}</span>
                          <span className="chat-summary-time">
                            {formatChatTime(s.lastMessage?.createdAt ?? s.updatedAt)}
                          </span>
                        </div>
                        <div className="chat-summary-row">
                          <span className="chat-summary-preview">{preview}</span>
                          {s.unreadCount > 0 && <span className="unread-badge">{s.unreadCount}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
