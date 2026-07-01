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
  return (
    <div className="chats-list-panel animate-fade-in">
      <div className="panel-header">
        <h2>Chats</h2>
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
          placeholder="Search chats or contacts..."
          className="search-input"
        />
      </div>

      <div className="scroll-container chat-sidebar-scroll">
        <div className="sidebar-section">
          <h3>Recent Conversations</h3>
          {summaries.length === 0 ? (
            <div className="empty-sidebar-state">No conversations yet</div>
          ) : (
            <ul className="chat-summary-list">
              {summaries.map((s) => {
                const title = s.peer?.name ?? s.chat.title ?? "Chat";
                const isSelected = s.chat.id === activeChatId;
                const isPeerOnline = s.peer ? onlineUsers.has(s.peer.id) : false;
                const plainText = s.lastMessage ? decryptMessage(s.lastMessage.encryptedContent) : "";
                const preview = s.lastMessage
                  ? messageSnippet(plainText, s.lastMessage.fileName)
                  : "No messages yet";

                return (
                  <li key={s.chat.id} className={`chat-summary-item-wrapper ${isSelected ? "selected" : ""}`}>
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

        <div className="sidebar-section">
          <h3>Quick Contacts</h3>
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
                        size="sm"
                        isOnline={isUserOnline}
                        resolveUrl={resolveUrl}
                      />
                      <span className="chat-contact-name">{u.name}</span>
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
