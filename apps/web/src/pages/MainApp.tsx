import { useState } from "react";
import Avatar from "../components/Avatar";
import {
  ChatIcon,
  ContactsIcon,
  SettingsIcon,
  ProfileIcon,
  AdminIcon,
  LockIcon,
  LogOutIcon,
  ShieldIcon,
  InfoIcon,
} from "../components/Icons";
import ChatListPanel from "./ChatListPanel";
import ContactsPanel from "./ContactsPanel";
import CommunitiesPanel from "./CommunitiesPanel";
import SettingsPanel from "./SettingsPanel";
import ProfilePanel from "./ProfilePanel";
import ConversationPanel from "./ConversationPanel";
import type { ChatSummary, Community, DeleteRequest, Message, User } from "../types";

type UserTab = "chats" | "contacts" | "communities" | "settings" | "profile";

interface MainAppProps {
  currentUser: User;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  userTab: UserTab;
  setUserTab: (tab: UserTab) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  chatWallpaperIndex: number;
  setChatWallpaperIndex: (val: number | ((prev: number) => number)) => void;
  isMobileChatOpen: boolean;
  setIsMobileChatOpen: (val: boolean) => void;
  onlineUsers: Set<string>;
  backendReady: boolean;
  socketConnected: boolean;
  status: string;
  summaries: ChatSummary[];
  contacts: User[];
  communities: Community[];
  messages: Message[];
  decryptedMessages: Array<Message & { plainText: string }>;
  messageMap: Map<string, Message & { plainText: string }>;
  replyTargetId: string | null;
  setReplyTargetId: (id: string | null) => void;
  seenByMessageId: string | null;
  setSeenByMessageId: (id: string | null) => void;
  pendingFile: File | null;
  setPendingFile: (file: File | null) => void;
  isSendingAttachment: boolean;
  draft: string;
  setDraft: (val: string) => void;
  incomingDeleteRequest: DeleteRequest | null;
  rejectedDeleteRequestForMe: DeleteRequest | null;
  dismissDeleteNotice: (id: string) => void;
  approveDeleteFromPopup: (id: string) => Promise<void>;
  rejectDeleteFromPopup: (req: DeleteRequest) => Promise<void>;
  onSendMessage: () => Promise<void>;
  onToggleReaction: (msgId: string, emoji: string) => Promise<void>;
  onPinMessage: (msgId: string) => Promise<void>;
  onUnpinMessage: () => Promise<void>;
  onRequestDeleteChat: () => Promise<void>;
  onSearchInChat: () => void;
  onStartChat: (peer: User) => void;
  onOpenChat: (summary: ChatSummary) => void;
  onCreateCommunity: (name: string, desc: string, privacy: "PUBLIC" | "PRIVATE") => Promise<void>;
  onSaveProfile: (name: string, email: string, avatarFile: File | null) => Promise<void>;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
  onRefreshSummaries: () => void;
  onRefreshContacts: () => void;
  onSendTypingStart: () => void;
  onSendTypingStop: () => void;
  onClearChatHistory: () => void;
  onInitiateCall: (type: "voice" | "video") => void;
  resolveUrl: (url?: string) => string;
  formatLastSeen: (time?: string) => string;
  formatChatTime: (time?: string) => string;
  formatMessageDay: (time?: string) => string;
  getReactedUsers: (message: Message, emoji: string) => string[];
  userListLabel: (userIds: string[]) => string;
  getDeliveryLabel: (message: Message, me: User) => string;
  isAutoAttachmentText: (text: string, fileName?: string) => boolean;
  messageSnippet: (text: string, fileName?: string) => string;
  resolveUserName: (userId?: string) => string;
  activeTypingUsers: string[];
  activePeer: User | null;
  activeChatTitle: string;
  activeChatStatus: string;
  onScreenshotAttempt: () => void;
  customWallpaper: string | null;
  onCustomWallpaperChange: (url: string | null) => void;
}

export default function MainApp(props: MainAppProps) {
  const {
    currentUser,
    activeChatId,
    setActiveChatId,
    userTab,
    setUserTab,
    theme,
    onToggleTheme,
    chatWallpaperIndex,
    setChatWallpaperIndex,
    onScreenshotAttempt,
    customWallpaper,
    onCustomWallpaperChange,
    isMobileChatOpen,
    setIsMobileChatOpen,
    onlineUsers,
    backendReady,
    socketConnected,
    status,
    summaries,
    contacts,
    communities,
    decryptedMessages,
    messageMap,
    replyTargetId,
    setReplyTargetId,
    seenByMessageId,
    setSeenByMessageId,
    pendingFile,
    setPendingFile,
    isSendingAttachment,
    draft,
    setDraft,
    incomingDeleteRequest,
    rejectedDeleteRequestForMe,
    dismissDeleteNotice,
    approveDeleteFromPopup,
    rejectDeleteFromPopup,
    onSendMessage,
    onToggleReaction,
    onPinMessage,
    onUnpinMessage,
    onRequestDeleteChat,
    onSearchInChat,
    onStartChat,
    onOpenChat,
    onCreateCommunity,
    onSaveProfile,
    onSignOut,
    onDeleteAccount,
    onRefreshSummaries,
    onRefreshContacts,
    onSendTypingStart,
    onSendTypingStop,
    onClearChatHistory,
    onInitiateCall,
    resolveUrl,
    formatLastSeen,
    formatChatTime,
    formatMessageDay,
    getReactedUsers,
    userListLabel,
    getDeliveryLabel,
    isAutoAttachmentText,
    messageSnippet,
    resolveUserName,
    activeTypingUsers,
    activePeer,
    activeChatTitle,
    activeChatStatus,
  } = props;

  const [searchQuery, setSearchQuery] = useState("");

  // Filters active chat threads based on search input
  const filteredSummaries = summaries.filter((s) => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    const title = (s.peer?.name ?? s.chat.title ?? "").toLowerCase();
    const plainPreview = s.lastMessage
      ? messageSnippet(s.lastMessage.encryptedContent, s.lastMessage.fileName).toLowerCase()
      : "";
    return title.includes(needle) || plainPreview.includes(needle);
  });

  const handleBack = () => {
    setIsMobileChatOpen(false);
    setActiveChatId(null);
  };

  const renderLeftPanelContent = () => {
    switch (userTab) {
      case "chats":
        return (
          <ChatListPanel
            summaries={filteredSummaries}
            contacts={contacts}
            search={searchQuery}
            setSearch={setSearchQuery}
            onOpenChat={onOpenChat}
            onStartChat={onStartChat}
            activeChatId={activeChatId}
            onlineUsers={onlineUsers}
            backendReady={backendReady}
            onRefresh={onRefreshSummaries}
            resolveUrl={resolveUrl}
            formatChatTime={formatChatTime}
            messageSnippet={messageSnippet}
            decryptMessage={(content) => {
              try {
                return decodeURIComponent(escape(atob(content)));
              } catch {
                return "[Encrypted Message]";
              }
            }}
          />
        );
      case "contacts":
        return (
          <ContactsPanel
            contacts={contacts}
            onStartChat={onStartChat}
            onRefresh={onRefreshContacts}
            backendReady={backendReady}
            resolveUrl={resolveUrl}
            formatLastSeen={formatLastSeen}
          />
        );
      case "communities":
        return (
          <CommunitiesPanel
            communities={communities}
            onCreateCommunity={onCreateCommunity}
            backendReady={backendReady}
          />
        );
      case "settings":
        return (
          <SettingsPanel
            theme={theme}
            onToggleTheme={onToggleTheme}
            chatWallpaperIndex={chatWallpaperIndex}
            setChatWallpaperIndex={setChatWallpaperIndex}
            onNavigateToProfile={() => setUserTab("profile")}
            customWallpaper={customWallpaper}
            onCustomWallpaperChange={onCustomWallpaperChange}
            onDeleteAccount={onDeleteAccount}
          />
        );
      case "profile":
        return (
          <ProfilePanel
            currentUser={currentUser}
            onSignOut={onSignOut}
            onDeleteAccount={onDeleteAccount}
            onSaveProfile={onSaveProfile}
            backendReady={backendReady}
            resolveUrl={resolveUrl}
          />
        );
      default:
        return null;
    }
  };

  const activeSummary = summaries.find((s) => s.chat.id === activeChatId) ?? null;

  return (
    <div className="main-app-layout-shell">
      {/* Status banner */}
      {status && status !== "Ready" && status !== "Signed in" && status !== "Dev login successful" && (
        <div className="system-status-banner animate-slide-up">
          <InfoIcon size={14} />
          <span>{status}</span>
        </div>
      )}

      {/* Global Notice Alert triggers (outside active chat window for system notifications) */}
      {(incomingDeleteRequest && (!isMobileChatOpen || incomingDeleteRequest.chatId !== activeChatId)) ||
      (rejectedDeleteRequestForMe && (!isMobileChatOpen || rejectedDeleteRequestForMe.chatId !== activeChatId)) ? (
        <div className="global-overlay-notification-container">
          {incomingDeleteRequest && (!isMobileChatOpen || incomingDeleteRequest.chatId !== activeChatId) && (
            <div className="notice-banner-alert animate-rise">
              <div className="notice-banner-text">
                <strong>Delete Chat Request</strong>
                <p>
                  {resolveUserName(incomingDeleteRequest.requestedBy)} requested to delete conversation.
                </p>
              </div>
              <div className="notice-banner-buttons">
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => approveDeleteFromPopup(incomingDeleteRequest.id)}
                >
                  Approve
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => rejectDeleteFromPopup(incomingDeleteRequest)}
                >
                  Reject
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => dismissDeleteNotice(incomingDeleteRequest.id)}
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {rejectedDeleteRequestForMe && (!isMobileChatOpen || rejectedDeleteRequestForMe.chatId !== activeChatId) && (
            <div className="notice-banner-alert animate-rise">
              <div className="notice-banner-text">
                <strong>Delete Request Rejected</strong>
                <p>Delete request was rejected by the chat recipient.</p>
              </div>
              <div className="notice-banner-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => dismissDeleteNotice(rejectedDeleteRequestForMe.id)}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Desktop sidebar navigation */}
      <nav className="desktop-app-sidebar">
        <div className="sidebar-avatar-section">
          <Avatar
            name={currentUser.name}
            avatarUrl={currentUser.avatarUrl}
            size="md"
            resolveUrl={resolveUrl}
          />
          <span className="sidebar-username">{currentUser.name}</span>
        </div>

        <ul className="sidebar-nav-links">
          {(
            [
              { id: "chats", icon: <ChatIcon size={20} />, label: "Chats" },
              { id: "contacts", icon: <ContactsIcon size={20} />, label: "Contacts" },
              { id: "communities", icon: <GroupIcon size={20} />, label: "Communities" },
              { id: "settings", icon: <SettingsIcon size={20} />, label: "Settings" },
              { id: "profile", icon: <ProfileIcon size={20} />, label: "Profile" },
            ] as const
          ).map((tab) => (
            <li key={tab.id}>
              <button
                className={`sidebar-nav-btn ${userTab === tab.id ? "active" : ""}`}
                onClick={() => {
                  setUserTab(tab.id);
                  setIsMobileChatOpen(false);
                }}
                title={tab.label}
              >
                {tab.icon}
                <span className="sidebar-btn-label">{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer-links">
          <button className="sidebar-nav-btn text-danger" onClick={onSignOut} title="Sign Out">
            <LogOutIcon size={20} />
            <span className="sidebar-btn-label">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main layout container (splits left sidebar vs right conversation) */}
      <div className={`app-workspace-split ${isMobileChatOpen ? "mobile-chat-active" : ""}`}>
        {/* Left Side Sub Panel */}
        <div className="app-sub-sidebar">{renderLeftPanelContent()}</div>

        {/* Right Side Conversation View */}
        <div className="app-conversation-view">
          {activeChatId && activeSummary ? (
            <ConversationPanel
              activeSummary={activeSummary}
              currentUser={currentUser}
              messages={props.messages}
              decryptedMessages={decryptedMessages}
              messageMap={messageMap}
              onScreenshotAttempt={onScreenshotAttempt}
              customWallpaper={customWallpaper}
              replyTargetId={replyTargetId}
              setReplyTargetId={setReplyTargetId}
              seenByMessageId={seenByMessageId}
              setSeenByMessageId={setSeenByMessageId}
              pendingFile={pendingFile}
              setPendingFile={setPendingFile}
              isSendingAttachment={isSendingAttachment}
              draft={draft}
              setDraft={setDraft}
              chatWallpaperIndex={chatWallpaperIndex}
              setChatWallpaperIndex={setChatWallpaperIndex}
              activeTypingUsers={activeTypingUsers}
              activePeer={activePeer}
              activeChatTitle={activeChatTitle}
              activeChatStatus={activeChatStatus}
              incomingDeleteRequest={incomingDeleteRequest}
              rejectedDeleteRequestForMe={rejectedDeleteRequestForMe}
              dismissDeleteNotice={dismissDeleteNotice}
              approveDeleteFromPopup={approveDeleteFromPopup}
              rejectDeleteFromPopup={rejectDeleteFromPopup}
              onSendMessage={onSendMessage}
              onToggleReaction={onToggleReaction}
              onPinMessage={onPinMessage}
              onUnpinMessage={onUnpinMessage}
              onRequestDeleteChat={onRequestDeleteChat}
              onClearChatHistory={onClearChatHistory}
              onInitiateCall={onInitiateCall}
              onSearchInChat={onSearchInChat}
              onBack={handleBack}
              resolveUrl={resolveUrl}
              formatMessageDay={formatMessageDay}
              getReactedUsers={getReactedUsers}
              userListLabel={userListLabel}
              getDeliveryLabel={getDeliveryLabel}
              isAutoAttachmentText={isAutoAttachmentText}
              messageSnippet={messageSnippet}
              resolveUserName={resolveUserName}
              backendReady={backendReady}
              onSendTypingStart={onSendTypingStart}
              onSendTypingStop={onSendTypingStop}
            />
          ) : (
            <div className="conversation-empty-view animate-fade-in">
              <div className="empty-logo-wrapper">
                <LockIcon size={44} className="empty-logo-icon" />
              </div>
              <h2>ELiSecureChat Redesign</h2>
              <p>Select a contact or active thread from the left menu to start sending encrypted messages.</p>
              <div className="empty-metrics-row">
                <div className="metric-pill">
                  <span className={`pill-dot ${backendReady ? "online" : "offline"}`} />
                  <span>API Services: {backendReady ? "Live" : "Offline"}</span>
                </div>
                <div className="metric-pill">
                  <span className={`pill-dot ${socketConnected ? "online" : "offline"}`} />
                  <span>WebSocket Gateway: {socketConnected ? "Connected" : "Disengaged"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className={`mobile-bottom-tabs ${isMobileChatOpen ? "hidden" : ""}`}>
        {(
          [
            { id: "chats", icon: <ChatIcon size={20} />, label: "Chats" },
            { id: "contacts", icon: <ContactsIcon size={20} />, label: "Contacts" },
            { id: "communities", icon: <GroupIcon size={20} />, label: "Groups" },
            { id: "settings", icon: <SettingsIcon size={20} />, label: "Settings" },
            { id: "profile", icon: <ProfileIcon size={20} />, label: "Profile" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            className={`mobile-tab-btn ${userTab === tab.id ? "active" : ""}`}
            onClick={() => {
              setUserTab(tab.id);
              setIsMobileChatOpen(false);
            }}
          >
            {tab.icon}
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// Inline helper GroupIcon for quick fallback
function GroupIcon({ size = 20, ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
