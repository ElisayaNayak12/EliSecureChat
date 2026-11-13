import { useRef, useEffect, useState, useMemo } from "react";
import { checkTone } from "../features/tone";
import { capsuleText, formatOpenDate, parseCapsule } from "../features/capsule";
import ExpressionPanel, { GifCard } from "../components/ExpressionPanel";
import { LeafySticker } from "../stickers/leafy";
import { gifText, parseRich, stickerText, suggestFor } from "../stickers/expressions";
import type { WallpaperId } from "../types";
import { WALLPAPERS } from "../theme";
import VoiceRecorder from "../components/VoiceRecorder";
import EncryptionInfo from "../e2ee/EncryptionInfo";
import Avatar from "../components/Avatar";
import {
  ArrowLeftIcon,
  PhoneIcon,
  VideoIcon,
  PinIcon,
  ReplyIcon,
  AttachmentIcon,
  SendIcon,
  EmojiIcon,
  TrashIcon,
  MuteIcon,
  InfoIcon,
  SearchIcon,
  DoubleCheckIcon,
  CheckIcon,
  CloseIcon,
} from "../components/Icons";
import type { ChatSummary, Message, User, DeleteRequest } from "../types";

const MESSAGE_PAGE = 150;

interface ConversationPanelProps {
  onSendVoice: (file: File) => Promise<void>;
  onToggleBlock: (peerId: string) => Promise<void>;
  isPeerBlocked: boolean;
  chatId?: string | null;
  activeSummary: ChatSummary;
  currentUser: User;
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
  chatWallpaper: WallpaperId;
  setChatWallpaper: (val: WallpaperId) => void;
  activeTypingUsers: string[];
  activePeer: User | null;
  activeChatTitle: string;
  activeChatStatus: string;
  incomingDeleteRequest: DeleteRequest | null;
  rejectedDeleteRequestForMe: DeleteRequest | null;
  dismissDeleteNotice: (id: string) => void;
  approveDeleteFromPopup: (id: string) => Promise<void>;
  rejectDeleteFromPopup: (req: DeleteRequest) => Promise<void>;
  onSendMessage: () => Promise<void>;
  onSendRich: (text: string) => Promise<void>;
  onToggleReaction: (msgId: string, emoji: string) => Promise<void>;
  onPinMessage: (msgId: string) => Promise<void>;
  onUnpinMessage: () => Promise<void>;
  onRequestDeleteChat: () => Promise<void>;
  onClearChatHistory: () => void;
  onInitiateCall: (type: "voice" | "video") => void;
  onSearchInChat: () => void;
  onBack: () => void;
  resolveUrl: (url?: string) => string;
  formatMessageDay: (time?: string) => string;
  getReactedUsers: (message: Message, emoji: string) => string[];
  userListLabel: (userIds: string[]) => string;
  getDeliveryLabel: (message: Message, me: User) => string;
  isAutoAttachmentText: (text: string, fileName?: string) => boolean;
  messageSnippet: (text: string, fileName?: string) => string;
  resolveUserName: (userId?: string) => string;
  backendReady: boolean;
  onSendTypingStart: () => void;
  onSendTypingStop: () => void;
  onScreenshotAttempt: () => void;
  customWallpaper?: string | null;
}

const QUICK_REACTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}"] as const;

export default function ConversationPanel({
  activeSummary,
  currentUser,
  messages,
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
  chatWallpaper,
  setChatWallpaper,
  activeTypingUsers,
  activePeer,
  chatId,
  onSendVoice,
  onToggleBlock,
  isPeerBlocked,
  activeChatTitle,
  activeChatStatus,
  incomingDeleteRequest,
  rejectedDeleteRequestForMe,
  dismissDeleteNotice,
  approveDeleteFromPopup,
  rejectDeleteFromPopup,
  onSendMessage,
  onSendRich,
  onToggleReaction,
  onPinMessage,
  onUnpinMessage,
  onRequestDeleteChat,
  onClearChatHistory,
  onInitiateCall,
  onSearchInChat,
  onBack,
  resolveUrl,
  formatMessageDay,
  getReactedUsers,
  userListLabel,
  getDeliveryLabel,
  isAutoAttachmentText,
  messageSnippet,
  resolveUserName,
  backendReady,
  onSendTypingStart,
  onSendTypingStop,
  onScreenshotAttempt,
  customWallpaper,
}: ConversationPanelProps) {
  const [chatPanelView, setChatPanelView] = useState<"messages" | "profile">("messages");
  // Long chats render only the most recent messages; older ones load on request.
  const [visibleCount, setVisibleCount] = useState(MESSAGE_PAGE);
  useEffect(() => setVisibleCount(MESSAGE_PAGE), [chatId]);
  const firstVisible = Math.max(0, decryptedMessages.length - visibleCount);
  const visibleMessages = firstVisible ? decryptedMessages.slice(firstVisible) : decryptedMessages;
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isScreenHidden, setIsScreenHidden] = useState(false);

  // Prevent Clipboard Copy
  useEffect(() => {
    const preventCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("Copying text is disabled in secure chats.");
    };
    document.addEventListener("copy", preventCopy);
    return () => document.removeEventListener("copy", preventCopy);
  }, []);

  // Shield Content on Defocus/Blur
  useEffect(() => {
    const handleBlur = () => setIsScreenHidden(true);
    const handleFocus = () => setIsScreenHidden(false);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    if (!document.hasFocus()) {
      setIsScreenHidden(true);
    }
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Detect PrintScreen and screenshot combinations
  useEffect(() => {
    const detectScreenshot = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        (e.ctrlKey && e.key === "p") ||
        (e.metaKey && e.shiftKey && e.key === "s") ||
        (e.ctrlKey && e.shiftKey && e.key === "s")
      ) {
        e.preventDefault();
        alert("Security Violation: Screenshots, printing, and capturing are prohibited. Clear history triggered.");
        onScreenshotAttempt();
      }
    };
    window.addEventListener("keydown", detectScreenshot);
    window.addEventListener("keyup", detectScreenshot);
    return () => {
      window.removeEventListener("keydown", detectScreenshot);
      window.removeEventListener("keyup", detectScreenshot);
    };
  }, [onScreenshotAttempt]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, activeTypingUsers]);

  // Click outside listener for menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (chatMenuOpen && chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setChatMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [chatMenuOpen]);

  const replyTarget = useMemo(() => {
    return replyTargetId ? messageMap.get(replyTargetId) ?? null : null;
  }, [replyTargetId, messageMap]);

  const pinnedMessage = useMemo(() => {
    return activeSummary?.chat.pinnedMessageId ? messageMap.get(activeSummary.chat.pinnedMessageId) ?? null : null;
  }, [activeSummary?.chat.pinnedMessageId, messageMap]);

  const handlePickAttachment = () => {
    if (!backendReady) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
    }
  };

  const handleComposerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    onSendTypingStart();
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onSendTypingStop();
    }, 1200);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onSendMessage();
    }
  };

  const suggestions = useMemo(() => suggestFor(draft), [draft]);
  const tone = useMemo(() => checkTone(draft), [draft]);
  const [toneDismissed, setToneDismissed] = useState("");
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [capsuleDate, setCapsuleDate] = useState(tomorrow);
  const sendCapsule = async () => {
    const text = draft.trim();
    if (!text || capsuleDate < tomorrow) return;
    setCapsuleOpen(false);
    await onSendRich(capsuleText(capsuleDate, text));
    setDraft("");
  };

  const changeWallpaper = () => {
    const i = WALLPAPERS.findIndex((w) => w.id === chatWallpaper);
    setChatWallpaper(WALLPAPERS[(i + 1) % WALLPAPERS.length].id);
    setChatMenuOpen(false);
  };

  const getUsername = (user?: User | null) => {
    if (!user) return "@unknown";
    if (user.email) return `@${user.email.split("@")[0].toLowerCase()}`;
    return `@${user.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "user"}`;
  };

  return (
    <div className="conversation-panel-container animate-fade-in" style={{ position: "relative" }}>
      {isScreenHidden && (
        <div className="security-shield-overlay">
          <div className="security-shield-card animate-scale-up">
            <span style={{ fontSize: "48px", marginBottom: "16px", display: "block" }}>🔒</span>
            <h3>Security Shield Active</h3>
            <p>Content hidden to prevent screen capture & background snips</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="conversation-header">
        <button className="btn-icon mobile-back-btn" onClick={onBack} aria-label="Go back">
          <ArrowLeftIcon size={20} />
        </button>

        <button
          className="header-profile-trigger"
          onClick={() => setChatPanelView((prev) => (prev === "profile" ? "messages" : "profile"))}
          disabled={!activePeer}
        >
          <Avatar
            name={activeChatTitle}
            avatarUrl={activePeer?.avatarUrl}
            size="sm"
            resolveUrl={resolveUrl}
          />
          <div className="header-text-details">
            <span className="header-title">{activeChatTitle}</span>
            <span className={`header-subtitle ${activeTypingUsers.length > 0 ? "is-typing" : ""} ${/online/i.test(activeChatStatus) ? "is-online" : ""}`}>
              {activeTypingUsers.length > 0 ? "typing..." : activeChatStatus}
            </span>
          </div>
        </button>

        <div className="header-actions">
          {chatPanelView === "messages" && (
            <>
              <button
                className="btn-icon"
                onClick={() => onInitiateCall("voice")}
                title="Voice Call"
                aria-label="Voice Call"
                disabled={!activePeer}
              >
                <PhoneIcon size={20} />
              </button>
              <button
                className="btn-icon"
                onClick={() => onInitiateCall("video")}
                title="Video Call"
                aria-label="Video Call"
                disabled={!activePeer}
              >
                <VideoIcon size={20} />
              </button>
            </>
          )}

          <div className="menu-dropdown-wrapper" ref={chatMenuRef}>
            <button
              className="btn-icon"
              onClick={() => setChatMenuOpen((prev) => !prev)}
              title="More Actions"
              aria-label="More Actions"
            >
              <span className="kebab-glyph" aria-hidden="true">⋯</span>
            </button>

            {chatMenuOpen && (
              <div className="menu-dropdown-content animate-slide-up">
                <button
                  type="button"
                  onClick={() => {
                    alert(`Notifications muted for ${activeChatTitle}`);
                    setChatMenuOpen(false);
                  }}
                >
                  <MuteIcon size={16} /> Mute Notifications
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatMenuOpen(false);
                    onSearchInChat();
                  }}
                >
                  <SearchIcon size={16} /> Search in Conversation
                </button>
                <button type="button" onClick={changeWallpaper}>
                  Change Wallpaper
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearChatHistory();
                    setChatMenuOpen(false);
                  }}
                >
                  🧹 Clear Chat History
                </button>
                {activePeer && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setChatMenuOpen(false);
                      void onRequestDeleteChat();
                    }}
                  >
                    <TrashIcon size={16} /> Delete Entire Chat
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {chatPanelView === "messages" ? (
        <div className="conversation-body-wrapper">
          {/* Notice boxes for delete request states */}
          {incomingDeleteRequest && (
            <div className="notice-banner-alert">
              <div className="notice-banner-text">
                <strong>Delete Chat Requested</strong>
                <p>
                  {resolveUserName(incomingDeleteRequest.requestedBy)} requested to erase this chat.
                  Confirming will permanently wipe the conversation history for both users.
                </p>
              </div>
              <div className="notice-banner-buttons">
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => approveDeleteFromPopup(incomingDeleteRequest.id)}
                >
                  Approve Erasure
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

          {rejectedDeleteRequestForMe && (
            <div className="notice-banner-alert">
              <div className="notice-banner-text">
                <strong>Delete Request Rejected</strong>
                <p>Your request to delete this conversation was rejected by the recipient.</p>
              </div>
              <div className="notice-banner-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => dismissDeleteNotice(rejectedDeleteRequestForMe.id)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Pinned Banner */}
          {pinnedMessage && (
            <div className="pinned-message-banner">
              <PinIcon size={16} className="pinned-message-icon" />
              <div className="pinned-message-content">
                <span className="pinned-label">Pinned Message</span>
                <span className="pinned-preview">
                  {messageSnippet(pinnedMessage.plainText, pinnedMessage.fileName)}
                </span>
              </div>
              <button className="btn-unpin" onClick={onUnpinMessage}>
                Unpin
              </button>
            </div>
          )}

          {/* Messages Feed Container */}
          <div
            className={`chat-scroll-area wallpaper-${chatWallpaper}`}
            style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          >
            {decryptedMessages.length === 0 ? (
              <div className="chat-empty-state">
                <div className="chat-empty-circle">
                  <InfoIcon size={24} />
                </div>
                <h3>No messages here yet</h3>
                <p>Send a message to start the conversation.</p>
              </div>
            ) : (
              <div className="messages-grid">
                {firstVisible > 0 && (
                  <button type="button" className="btn btn-ghost btn-xs messages-load-earlier" onClick={() => setVisibleCount((n) => n + MESSAGE_PAGE)}>
                    Show earlier messages ({firstVisible})
                  </button>
                )}
                {visibleMessages.map((m, index) => {
                  const isMine = m.senderId === currentUser.id;
                  const statusLabel = isMine ? getDeliveryLabel(m, currentUser) : "";
                  const showText = !(m.attachmentUrl && isAutoAttachmentText(m.plainText, m.fileName));
                  const rich = m.attachmentUrl ? null : parseRich(m.plainText);
                  const capsule = m.attachmentUrl ? null : parseCapsule(m.plainText);
                  const replied = m.replyToMessageId ? messageMap.get(m.replyToMessageId) : undefined;

                  // Render date pill if date changed from previous message
                  const showDatePill =
                    index === 0 ||
                    formatMessageDay(m.createdAt) !== formatMessageDay(visibleMessages[index - 1].createdAt);

                  return (
                    <div key={m.id} className="message-row-wrapper">
                      {showDatePill && (
                        <div className="message-date-separator">
                          <span>{formatMessageDay(m.createdAt)}</span>
                        </div>
                      )}

                      <div className={`message-bubble-wrapper ${isMine ? "mine" : "incoming"}`}>
                        <div className={`message-bubble ${isMine ? "bubble-mine" : "bubble-incoming"} ${rich ? "bubble-rich" : ""}`}>
                          {/* Replied block */}
                          {replied && (
                            <div className="reply-preview-container">
                              <span className="reply-sender">
                                {replied.senderId === currentUser.id ? "You" : resolveUserName(replied.senderId)}
                              </span>
                              <span className="reply-content">
                                {messageSnippet(replied.plainText, replied.fileName)}
                              </span>
                            </div>
                          )}

                          {/* Media attachments */}
                          {m.attachmentUrl && (
                            <div className="attachment-content-box">
                              {m.mimeType?.startsWith("audio/") ? (
                                <audio className="attachment-audio" controls preload="metadata" src={resolveUrl(m.attachmentUrl)} aria-label="Voice message" />
                              ) : m.mimeType?.startsWith("image/") ? (
                                <a
                                  href={resolveUrl(m.attachmentUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="attachment-img-link"
                                >
                                  <img
                                    className="attachment-img-render"
                                    src={resolveUrl(m.attachmentUrl)}
                                    alt={m.fileName ?? "image"}
                                  />
                                </a>
                              ) : (
                                <a
                                  className="attachment-file-download"
                                  href={resolveUrl(m.attachmentUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <div className="attachment-file-icon">📁</div>
                                  <div className="attachment-file-details">
                                    <span className="attachment-file-name">
                                      {m.fileName ?? "Download File"}
                                    </span>
                                    {m.fileSize && (
                                      <span className="attachment-file-size">
                                        {Math.ceil(m.fileSize / 1024)} KB
                                      </span>
                                    )}
                                  </div>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Message Text */}
                          {rich?.kind === "sticker" && <div className="message-sticker"><LeafySticker sticker={rich.sticker} size={150} /></div>}
                          {rich?.kind === "gif" && <div className="message-gif"><GifCard gif={rich.gif} /></div>}
                          {capsule && !capsule.open && (
                            <div className="capsule-sealed" role="note">
                              <span className="capsule-icon" aria-hidden="true">⏳</span>
                              <span>
                                <strong>Sealed time capsule</strong>
                                <small>Opens on {formatOpenDate(capsule.opensOn)}</small>
                                {isMine && <em>You wrote: “{capsule.text.slice(0, 80)}”</em>}
                              </span>
                            </div>
                          )}
                          {capsule && capsule.open && (
                            <>
                              <span className="capsule-badge">⏳ Time capsule · opened {formatOpenDate(capsule.opensOn)}</span>
                              <div className="message-plain-text">{capsule.text}</div>
                            </>
                          )}
                          {showText && !rich && !capsule && <div className="message-plain-text">{m.plainText}</div>}

                          {/* Reactions */}
                          {m.reactions && m.reactions.length > 0 && (
                            <div className="message-reactions-row">
                              {m.reactions.map((r) => (
                                <button
                                  key={`${m.id}-${r.emoji}`}
                                  className={`reaction-chip-item ${
                                    r.userIds.includes(currentUser.id) ? "active" : ""
                                  }`}
                                  onClick={() => void onToggleReaction(m.id, r.emoji)}
                                  title={`Reacted by: ${userListLabel(r.userIds)}`}
                                >
                                  <span className="emoji-char">{r.emoji}</span>
                                  <span className="emoji-count">{r.userIds.length}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Seen logs toggle details */}
                          {seenByMessageId === m.id && (
                            <div className="message-delivery-details">
                              <span>Delivered to: {userListLabel(m.deliveredTo)}</span>
                              <span>Read by: {userListLabel(m.readBy)}</span>
                            </div>
                          )}

                          {/* Bubble Footer details */}
                          <div className="bubble-footer-meta">
                            <span className="message-timestamp">
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isMine && (
                              <span className="message-receipt-icon">
                                {statusLabel === "read" ? (
                                  <DoubleCheckIcon size={14} className="receipt-read" />
                                ) : statusLabel === "delivered" ? (
                                  <DoubleCheckIcon size={14} className="receipt-delivered" />
                                ) : (
                                  <CheckIcon size={14} className="receipt-sent" />
                                )}
                              </span>
                            )}
                          </div>

                          {/* Hover action bar */}
                          <div className="bubble-hover-actions">
                            <button
                              className="action-btn"
                              onClick={() => setReplyTargetId(m.id)}
                              title="Reply"
                            >
                              <ReplyIcon size={12} />
                            </button>
                            <button
                              className="action-btn"
                              onClick={() => void onPinMessage(m.id)}
                              title="Pin"
                            >
                              <PinIcon size={12} />
                            </button>
                            <button
                              className="action-btn"
                              onClick={() => setSeenByMessageId(seenByMessageId === m.id ? null : m.id)}
                              title="Delivery Details"
                            >
                              <InfoIcon size={12} />
                            </button>

                            <div className="quick-emoji-selector">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={`${m.id}-quick-${emoji}`}
                                  className="quick-emoji-btn"
                                  onClick={() => void onToggleReaction(m.id, emoji)}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
            )}
          </div>

          {/* Composer Input Area */}
          <div className="composer-container-wrapper">
            {replyTarget && (
              <div className="composer-reply-target">
                <div className="reply-target-left">
                  <span>Replying to <strong>{resolveUserName(replyTarget.senderId)}</strong></span>
                  <p>{messageSnippet(replyTarget.plainText, replyTarget.fileName)}</p>
                </div>
                <button className="reply-close-btn" onClick={() => setReplyTargetId(null)}>
                  <CloseIcon size={16} />
                </button>
              </div>
            )}

            {pendingFile && (
              <div className="composer-pending-attachment">
                <div className="pending-left">
                  <span className="pending-file-icon">📎</span>
                  <span className="pending-file-name">{pendingFile.name}</span>
                  <span className="pending-file-size">
                    ({Math.ceil(pendingFile.size / 1024)} KB)
                  </span>
                </div>
                <button className="pending-close-btn" onClick={() => setPendingFile(null)}>
                  <CloseIcon size={16} />
                </button>
              </div>
            )}

            {isPeerBlocked && activePeer && (
              <div className="composer-blocked" role="status">
                You blocked {activePeer.name}. You can't message or call each other.
                <button className="btn btn-secondary btn-xs" onClick={() => void onToggleBlock(activePeer.id)}>Unblock</button>
              </div>
            )}
            {tone.harsh && toneDismissed !== draft && !isPeerBlocked && (
              <div className="tone-check" role="status">
                <span className="tone-icon" aria-hidden="true">💬</span>
                <div className="tone-main">
                  <strong>This may sound harsh</strong>
                  <span>{tone.reasons.join(" · ")}. Kinder: “{tone.kinder}”</span>
                </div>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setDraft(tone.kinder)}>Use kinder</button>
                <button type="button" className="tone-dismiss" onClick={() => setToneDismissed(draft)} aria-label="Keep my words">Keep mine</button>
              </div>
            )}
            {capsuleOpen && (
              <div className="capsule-popover" role="dialog" aria-label="Time capsule">
                <strong>⏳ Time capsule</strong>
                <span>Seal your typed message until a date you choose: a birthday, an anniversary, a new year.</span>
                <label>Opens on <input type="date" min={tomorrow} value={capsuleDate} onChange={(e) => setCapsuleDate(e.target.value)} aria-label="Opening date" /></label>
                <div className="capsule-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCapsuleOpen(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={!draft.trim() || capsuleDate < tomorrow} onClick={() => void sendCapsule()}>Seal and send</button>
                </div>
                {!draft.trim() && <small>Type your message first.</small>}
              </div>
            )}
            {suggestions && !isPeerBlocked && (
              <div className="smart-suggest" aria-label="Suggestions for your message">
                <span className="smart-suggest-label">Suggested</span>
                {suggestions.emoji.map((e) => (
                  <button key={e} type="button" className="ss-emoji" onClick={() => setDraft(draft.trimEnd() + " " + e)} aria-label={`Add ${e}`}>{e}</button>
                ))}
                {suggestions.stickers.map((st) => (
                  <button key={st.id} type="button" className="ss-sticker" onClick={() => void onSendRich(stickerText(st.id))} title={`Send ${st.label} sticker`} aria-label={`Send ${st.label} sticker`}>
                    <LeafySticker sticker={st} size={44} />
                  </button>
                ))}
                {suggestions.gifs.map((g) => (
                  <button key={g.id} type="button" className="ss-gif" onClick={() => void onSendRich(gifText(g.id))} title={`Send ${g.label} GIF`} aria-label={`Send ${g.label} GIF`}>
                    <GifCard gif={g} small />
                  </button>
                ))}
              </div>
            )}
            <div className={`composer-input-row ${isPeerBlocked ? "is-blocked" : ""}`}>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <button
                className="btn-composer-action"
                onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                title="Toggle Emojis"
              >
                <EmojiIcon size={22} />
              </button>
              <button
                className="btn-composer-action capsule-btn"
                onClick={() => setCapsuleOpen((v) => !v)}
                title="Time capsule"
                aria-label="Time capsule"
                disabled={isPeerBlocked}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
              </button>

              {isEmojiPickerOpen && (
                <ExpressionPanel
                  onEmoji={(e) => setDraft(draft + e)}
                  onSticker={(id) => { setIsEmojiPickerOpen(false); void onSendRich(stickerText(id)); }}
                  onGif={(id) => { setIsEmojiPickerOpen(false); void onSendRich(gifText(id)); }}
                  onClose={() => setIsEmojiPickerOpen(false)}
                />
              )}

              <input
                type="text"
                value={draft}
                onChange={handleComposerChange}
                onKeyDown={handleKeyPress}
                placeholder="Message"
                className="composer-input-field"
              />

              <VoiceRecorder
                disabled={!backendReady || isSendingAttachment || isPeerBlocked}
                onRecorded={(f) => onSendVoice(f)}
                onError={(msg) => window.alert(msg)}
              />

              <button
                className="btn-composer-action"
                onClick={handlePickAttachment}
                disabled={!backendReady || isSendingAttachment}
                title="Attach Document"
              >
                <AttachmentIcon size={22} />
              </button>

              <button
                className="btn-composer-send"
                onClick={() => void onSendMessage()}
                disabled={!backendReady || isSendingAttachment || (!draft.trim() && !pendingFile)}
                title="Send Message"
              >
                <SendIcon size={20} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Profile Panel View */
        <div className="peer-profile-panelscroll animate-fade-in">
          <div className="peer-profile-card">
            <Avatar
              name={activeChatTitle}
              avatarUrl={activePeer?.avatarUrl}
              size="xl"
              resolveUrl={resolveUrl}
            />
            <h3>{activeChatTitle}</h3>
            <p className="peer-status-text">{activeChatStatus}</p>

            <div className="peer-quick-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => setChatPanelView("messages")}
              >
                Open Message Thread
              </button>
            </div>

            <div className="peer-info-grid">
              <div className="peer-info-item">
                <span className="info-label">Mobile Number</span>
                <span className="info-value">{activePeer?.phone ?? "Unavailable"}</span>
              </div>
              <div className="peer-info-item">
                <span className="info-label">Username handle</span>
                <span className="info-value">{getUsername(activePeer)}</span>
              </div>
              <div className="peer-info-item">
                <span className="info-label">Encryption</span>
                <EncryptionInfo chatId={chatId ?? null} peerId={activePeer?.id} peerName={activePeer?.name} />
              </div>
              <div className="peer-info-item">
                <span className="info-label">Erasure Status</span>
                <span className="info-value text-accent">Mutual delete capability enabled</span>
              </div>
            </div>
            {activePeer && (
              <button className={`btn btn-sm ${isPeerBlocked ? "btn-secondary" : "btn-danger"} peer-block-btn`} onClick={() => void onToggleBlock(activePeer.id)}>
                {isPeerBlocked ? `Unblock ${activePeer.name}` : `Block ${activePeer.name}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
