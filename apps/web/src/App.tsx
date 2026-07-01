import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { decryptMessage, encryptMessage } from "./crypto";
import { socket } from "./socket";
import type { AdminOverview, ChatSummary, Community, DeleteRequest, Message, User } from "./types";
import AuthPage from "./pages/AuthPage";
import MainApp from "./pages/MainApp";
import Avatar from "./components/Avatar";
import { LockIcon } from "./components/Icons";

type UserTab = "chats" | "contacts" | "communities" | "settings" | "profile";

function normalizeMessageShape(message: Message): Message {
  const safeReadBy = Array.isArray(message.readBy) ? [...new Set(message.readBy)] : [];
  const safeDeliveredTo = Array.isArray(message.deliveredTo) ? [...new Set(message.deliveredTo)] : [];
  const safeReactions = Array.isArray(message.reactions)
    ? message.reactions
        .filter((r) => r && typeof r.emoji === "string")
        .map((r) => ({
          emoji: r.emoji,
          userIds: Array.isArray(r.userIds) ? [...new Set(r.userIds)] : [],
        }))
    : [];

  if (message.senderId && !safeReadBy.includes(message.senderId)) safeReadBy.push(message.senderId);
  if (message.senderId && !safeDeliveredTo.includes(message.senderId)) safeDeliveredTo.push(message.senderId);

  return {
    ...message,
    readBy: safeReadBy,
    deliveredTo: safeDeliveredTo,
    reactions: safeReactions,
  };
}

export function App() {
  const [userTab, setUserTab] = useState<UserTab>("chats");
  const [status, setStatus] = useState("Ready");
  const [backendReady, setBackendReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Call states
  const [callState, setCallState] = useState<"idle" | "outgoing" | "incoming" | "active">("idle");
  const [callType, setCallType] = useState<"voice" | "video">("voice");
  const [callChatId, setCallChatId] = useState<string | null>(null);
  const [callPartner, setCallPartner] = useState<User | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const [name, setName] = useState("User One");
  const [phone, setPhone] = useState("9000000001");
  const [email, setEmail] = useState("user1@example.com");
  const [password, setPassword] = useState("secret123");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatWallpaperIndex, setChatWallpaperIndex] = useState(0);
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(localStorage.getItem("custom_wallpaper"));
  const [dismissedDeleteNoticeIds, setDismissedDeleteNoticeIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [seenByMessageId, setSeenByMessageId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [deleteRequests, setDeleteRequests] = useState<DeleteRequest[]>([]);
  const [typingByChat, setTypingByChat] = useState<Record<string, string[]>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [socketConnected, setSocketConnected] = useState(false);

  const [communities, setCommunities] = useState<Community[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const joinedChatsRef = useRef(new Set<string>());
  const typingSentRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);

  const activeSummary = useMemo(
    () => summaries.find((s) => s.chat.id === activeChatId) ?? null,
    [summaries, activeChatId],
  );
  const decryptedMessages = useMemo(
    () => messages.map((m) => ({ ...m, plainText: decryptMessage(m.encryptedContent) })),
    [messages],
  );
  const messageMap = useMemo(
    () => new Map(decryptedMessages.map((m) => [m.id, m])),
    [decryptedMessages],
  );
  const activeTypingUsers = useMemo(() => {
    if (!activeChatId || !currentUser) return [];
    return (typingByChat[activeChatId] ?? []).filter((id) => id !== currentUser.id);
  }, [typingByChat, activeChatId, currentUser]);
  const activePeer = useMemo(() => activeSummary?.peer ?? null, [activeSummary]);
  const activeChatTitle = useMemo(
    () => activePeer?.name ?? activeSummary?.chat.title ?? "Chat",
    [activePeer?.name, activeSummary?.chat.title],
  );
  const activeChatStatus = useMemo(() => {
    if (!activePeer) return "secure chat";
    if (onlineUsers.has(activePeer.id)) return "online";
    return formatLastSeen(activePeer.lastSeenAt);
  }, [activePeer, onlineUsers]);
  const incomingDeleteRequest = useMemo(() => {
    if (!currentUser) return null;
    return (
      deleteRequests.find(
        (r) =>
          r.status === "PENDING" &&
          r.targetUserId === currentUser.id &&
          !dismissedDeleteNoticeIds.includes(r.id),
      ) ?? null
    );
  }, [currentUser, deleteRequests, dismissedDeleteNoticeIds]);
  const rejectedDeleteRequestForMe = useMemo(() => {
    if (!currentUser) return null;
    return (
      deleteRequests.find(
        (r) =>
          r.status === "REJECTED" &&
          r.requestedBy === currentUser.id &&
          !dismissedDeleteNoticeIds.includes(r.id),
      ) ?? null
    );
  }, [currentUser, deleteRequests, dismissedDeleteNoticeIds]);

  const apiBaseOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  // Theme Sync on Mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial = savedTheme ?? "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  // Call duration timer
  useEffect(() => {
    let interval: number | null = null;
    if (callState === "active") {
      interval = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  // Local camera/mic stream trigger
  useEffect(() => {
    async function startMediaStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === "video",
          audio: true
        });
        setLocalStream(stream);
      } catch (err) {
        console.warn("Failed to get media stream:", err);
      }
    }

    function stopMediaStream() {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
    }

    if (callState === "active") {
      void startMediaStream();
    } else if (callState === "idle") {
      stopMediaStream();
    }

    return () => stopMediaStream();
  }, [callState, callType]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setBackendReady(true);
      } catch {
        if (active) setBackendReady(false);
      }
    };
    void check();
    const t = setInterval(() => void check(), 2500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!backendReady) {
      setSocketConnected(false);
      return;
    }
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onPresence = (p: { userId: string; online: boolean; lastSeenAt?: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.userId);
        else next.delete(p.userId);
        return next;
      });
      if (!p.online && p.lastSeenAt) {
        setSummaries((prev) =>
          prev.map((s) =>
            s.peer?.id === p.userId
              ? { ...s, peer: { ...s.peer, lastSeenAt: p.lastSeenAt } }
              : s,
          ),
        );
      }
    };
    const onTyping = (p: { chatId: string; userId: string; isTyping: boolean }) => {
      setTypingByChat((prev) => {
        const set = new Set(prev[p.chatId] ?? []);
        if (p.isTyping) set.add(p.userId);
        else set.delete(p.userId);
        return { ...prev, [p.chatId]: [...set] };
      });
    };
    const onRead = (p: { messageIds: string[]; userId: string }) => {
      if (!p.messageIds.length) return;
      setMessages((prev) =>
        prev.map((m) =>
          p.messageIds.includes(m.id) && !normalizeMessageShape(m).readBy.includes(p.userId)
            ? normalizeMessageShape({ ...m, readBy: [...normalizeMessageShape(m).readBy, p.userId] })
            : normalizeMessageShape(m),
        ),
      );
    };
    const onDelivered = (p: { messageIds: string[]; userId: string }) => {
      if (!p.messageIds.length) return;
      setMessages((prev) =>
        prev.map((m) =>
          p.messageIds.includes(m.id) && !normalizeMessageShape(m).deliveredTo.includes(p.userId)
            ? normalizeMessageShape({ ...m, deliveredTo: [...normalizeMessageShape(m).deliveredTo, p.userId] })
            : normalizeMessageShape(m),
        ),
      );
    };
    const onReaction = (p: { messageId: string; chatId: string; reactions: Message["reactions"] }) => {
      if (p.chatId !== activeChatId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === p.messageId ? normalizeMessageShape({ ...m, reactions: p.reactions }) : normalizeMessageShape(m))),
      );
    };
    const onReceive = (m: Message) => {
      const incoming = normalizeMessageShape(m);
      
      // Decrypt message to inspect system controls
      let plain = "";
      try {
        plain = decodeURIComponent(escape(atob(incoming.encryptedContent)));
      } catch {}

      if (incoming.messageType === "SYSTEM" && plain.startsWith("[CALL_")) {
        handleCallSignal(incoming.senderId, incoming.chatId, plain);
      }

      if (m.chatId === activeChatId) {
        setMessages((prev) => (prev.some((x) => x.id === incoming.id) ? prev : [...prev.map(normalizeMessageShape), incoming]));
      }
      if (currentUser && m.senderId !== currentUser.id) {
        void markDelivered(incoming.chatId, currentUser.id, [incoming.id]);
        if (incoming.chatId === activeChatId) {
          void markRead(incoming.chatId, currentUser.id, [incoming.id]);
        }
      }
      if (currentUser) void refreshSummaries(currentUser.id);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence_update", onPresence);
    socket.on("typing_update", onTyping);
    socket.on("messages_read", onRead);
    socket.on("messages_delivered", onDelivered);
    socket.on("reaction_update", onReaction);
    socket.on("receive_message", onReceive);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence_update", onPresence);
      socket.off("typing_update", onTyping);
      socket.off("messages_read", onRead);
      socket.off("messages_delivered", onDelivered);
      socket.off("reaction_update", onReaction);
      socket.off("receive_message", onReceive);
      socket.disconnect();
    };
  }, [activeChatId, currentUser, backendReady]);

  useEffect(() => {
    if (!currentUser || !backendReady) return;
    void bootstrapUser(currentUser.id);
  }, [currentUser, backendReady]);

  // Check if current user was deleted by admin
  useEffect(() => {
    if (!currentUser || !backendReady) return;
    const checkUserExists = async () => {
      try {
        await api.getUser(currentUser.id);
      } catch (err) {
        if ((err as Error).message.includes("USER_NOT_FOUND")) {
          signOutUser();
          setStatus("Your account has been deleted by an administrator.");
        }
      }
    };
    const t = setInterval(checkUserExists, 4000);
    return () => clearInterval(t);
  }, [currentUser, backendReady]);

  useEffect(() => {
    if (!currentUser || !backendReady) return;
    const t = setInterval(() => void refreshSummaries(currentUser.id), 2500);
    return () => clearInterval(t);
  }, [currentUser, backendReady]);

  useEffect(() => {
    if (!activeChatId || !currentUser || !backendReady) return;
    const t = setInterval(() => void refreshChat(activeChatId, currentUser.id), 1700);
    return () => clearInterval(t);
  }, [activeChatId, currentUser, backendReady]);

  useEffect(() => {
    if (!currentUser) return;
    setProfileName(currentUser.name);
    setProfileEmail(currentUser.email ?? "");
  }, [currentUser]);

  useEffect(() => {
    if (userTab !== "chats") {
      setIsMobileChatOpen(false);
    }
  }, [userTab]);

  useEffect(() => {
    if (replyTargetId && !messageMap.has(replyTargetId)) {
      setReplyTargetId(null);
    }
    if (seenByMessageId && !messageMap.has(seenByMessageId)) {
      setSeenByMessageId(null);
    }
  }, [messageMap, replyTargetId, seenByMessageId]);

  useEffect(() => {
    if (!activeChatId) return;
    const exists = summaries.some((s) => s.chat.id === activeChatId);
    if (!exists) {
      setActiveChatId(null);
      setIsMobileChatOpen(false);
      setMessages([]);
      setDeleteRequests([]);
      setStatus("Chat was removed");
    }
  }, [activeChatId, summaries]);

  function resolveAttachmentUrl(attachmentUrl?: string) {
    if (!attachmentUrl) return "";
    if (attachmentUrl.startsWith("http://") || attachmentUrl.startsWith("https://")) return attachmentUrl;
    return `${apiBaseOrigin}${attachmentUrl}`;
  }

  function formatLastSeen(lastSeenAt?: string) {
    if (!lastSeenAt) return "last seen recently";
    const date = new Date(lastSeenAt);
    if (Number.isNaN(date.valueOf())) return "last seen recently";
    return `last seen ${date.toLocaleString()}`;
  }

  function formatChatTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    return sameDay
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString([], { month: "short", day: "2-digit" });
  }

  function formatMessageDay(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return date.toLocaleDateString([], { month: "long", day: "2-digit" });
  }

  function resolveUserName(userId?: string) {
    if (!userId) return "Unknown";
    if (currentUser?.id === userId) return "You";
    const fromContacts = contacts.find((u) => u.id === userId)?.name;
    const fromSummary = summaries.find((s) => s.peer?.id === userId)?.peer?.name;
    return fromContacts ?? fromSummary ?? `User ${userId.slice(0, 6)}`;
  }

  function resolveDeleteRequestChatTitle(request: DeleteRequest) {
    const summary = summaries.find((s) => s.chat.id === request.chatId);
    if (summary?.peer?.name) return summary.peer.name;
    if (summary?.chat.title) return summary.chat.title;
    if (!currentUser) return "this chat";
    if (request.requestedBy === currentUser.id) return resolveUserName(request.targetUserId);
    return resolveUserName(request.requestedBy);
  }

  function messageSnippet(text: string, fileName?: string) {
    if (isAutoAttachmentText(text, fileName)) {
      return fileName ? `[Attachment] ${fileName}` : "[Attachment]";
    }
    return text.slice(0, 64);
  }

  function getReactedUsers(message: Message, emoji: string) {
    return message.reactions.find((r) => r.emoji === emoji)?.userIds ?? [];
  }

  function userListLabel(userIds: string[]) {
    if (!userIds.length) return "none";
    return userIds.map((id) => resolveUserName(id)).join(", ");
  }

  function getDeliveryLabel(message: Message, me: User) {
    const safeMessage = normalizeMessageShape(message);
    if (safeMessage.senderId !== me.id) return "";
    const chat = summaries.find((s) => s.chat.id === message.chatId)?.chat;
    const recipients = (chat?.memberIds ?? []).filter((id) => id !== me.id);
    if (recipients.length === 0) return "sent";
    const readByAll = recipients.every((id) => safeMessage.readBy.includes(id));
    if (readByAll) return "read";
    const deliveredToAll = recipients.every((id) => safeMessage.deliveredTo.includes(id));
    return deliveredToAll ? "delivered" : "sent";
  }

  function isAutoAttachmentText(plainText: string, fileName?: string) {
    if (!fileName) return false;
    return plainText === `[Attachment] ${fileName}`;
  }

  function ensureBackend() {
    if (backendReady) return true;
    setStatus("Backend offline. Start both services: npm run dev");
    return false;
  }

  function extractApiError(err: unknown) {
    const raw = (err as Error)?.message ?? String(err);
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      const msg = parsed.message;
      if (Array.isArray(msg)) return msg.join(", ");
      if (typeof msg === "string") return msg;
      return raw;
    } catch {
      return raw;
    }
  }

  async function emitAck<T>(event: string, payload: object): Promise<T> {
    if (!ensureBackend()) throw new Error("BACKEND_OFFLINE");
    if (!socket.connected) socket.connect();
    return new Promise<T>((resolve, reject) => {
      socket.timeout(4000).emit(event, payload, (err: Error | null, data: T) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async function registerPresence(userId: string) {
    await emitAck("register_presence", { userId });
    setOnlineUsers((prev) => new Set(prev).add(userId));
  }

  async function joinChat(chatId: string) {
    if (joinedChatsRef.current.has(chatId)) return;
    await emitAck("join_chat", { chatId });
    joinedChatsRef.current.add(chatId);
  }

  async function markRead(chatId: string, userId: string, messageIds?: string[]) {
    try {
      await emitAck("mark_read", { chatId, userId, messageIds });
    } catch {
      await api.markRead(chatId, userId, messageIds);
    }
  }

  async function markDelivered(chatId: string, userId: string, messageIds?: string[]) {
    try {
      await emitAck("ack_delivered", { chatId, userId, messageIds });
    } catch {
      // Delivery acks are best-effort in fallback mode.
    }
  }

  async function refreshSummaries(userId: string) {
    if (!ensureBackend()) return;
    const [nextSummaries, nextDeleteRequests] = await Promise.all([
      api.listChatSummaries(userId),
      api.listUserDeleteRequests(userId),
    ]);
    setSummaries(nextSummaries);
    setDeleteRequests(nextDeleteRequests);
  }

  async function refreshCommunities() {
    if (!ensureBackend()) return;
    setCommunities(await api.listCommunities());
  }

  async function refreshContacts(userId: string) {
    if (!ensureBackend()) return;
    const users = await api.searchUsers("");
    setContacts(users.filter((u) => u.id !== userId));
  }

  async function refreshChat(chatId: string, userId: string) {
    if (!ensureBackend()) return;
    const list = await api.listMessages(chatId);
    const normalized = list.map((m) => normalizeMessageShape(m));
    setMessages(normalized);
    const undelivered = normalized
      .filter((m) => m.senderId !== userId && !m.deliveredTo.includes(userId))
      .map((m) => m.id);
    if (undelivered.length) {
      await markDelivered(chatId, userId, undelivered);
      await refreshSummaries(userId);
    }
    const unread = normalized
      .filter((m) => m.senderId !== userId && !m.readBy.includes(userId))
      .map((m) => m.id);
    if (unread.length) {
      await markRead(chatId, userId, unread);
      await refreshSummaries(userId);
    }
  }

  async function openChat(summary: ChatSummary) {
    if (!currentUser) return;
    setActiveChatId(summary.chat.id);
    setIsMobileChatOpen(true);
    setReplyTargetId(null);
    setSeenByMessageId(null);
    if (!backendReady) {
      setStatus("Chat opened in offline mode. Start backend for live sync.");
      return;
    }
    try {
      await joinChat(summary.chat.id);
      await refreshChat(summary.chat.id, currentUser.id);
    } catch (err) {
      setStatus(`Chat opened, sync failed: ${(err as Error).message}`);
    }
  }

  async function bootstrapUser(userId: string) {
    if (!ensureBackend()) return;
    await registerPresence(userId);
    await Promise.all([refreshSummaries(userId), refreshCommunities(), refreshContacts(userId)]);
  }

  async function handleSignIn(phoneVal: string, passwordVal: string) {
    if (!ensureBackend()) return;
    try {
      const result = await api.signIn(phoneVal.trim(), passwordVal);
      setCurrentUser(result.user);
      setStatus("Signed in");
    } catch (err) {
      setStatus(`Sign in failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async function handleSignUp(nameVal: string, phoneVal: string, emailVal: string, passwordVal: string) {
    if (!ensureBackend()) return;
    try {
      const result = await api.signUp(nameVal.trim(), phoneVal.trim(), emailVal.trim(), passwordVal);
      setCurrentUser(result.user);
      setStatus("Account created");
    } catch (err) {
      setStatus(`Sign up failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async function startChat(peer: User) {
    if (!ensureBackend()) return;
    if (!currentUser) return;
    const chat = await api.createOneToOneChat(currentUser.id, peer.id);
    await refreshSummaries(currentUser.id);
    await openChat({ chat, peer, unreadCount: 0, updatedAt: chat.createdAt });
  }

  async function sendTypingStart() {
    if (!currentUser || !activeChatId || typingSentRef.current) return;
    typingSentRef.current = true;
    try { await emitAck("typing_start", { chatId: activeChatId, userId: currentUser.id }); } catch {}
  }

  async function sendTypingStop() {
    if (!currentUser || !activeChatId || !typingSentRef.current) return;
    typingSentRef.current = false;
    try { await emitAck("typing_stop", { chatId: activeChatId, userId: currentUser.id }); } catch {}
  }

  async function sendMessage() {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    if (!draft.trim() && !pendingFile) return;

    const text = draft.trim();
    let encrypted = encryptMessage(text);
    let messageType: Message["messageType"] = "TEXT";
    let attachment:
      | {
          url: string;
          fileName: string;
          mimeType: string;
          fileSize: number;
        }
      | undefined;

    if (pendingFile) {
      setIsSendingAttachment(true);
      try {
        attachment = await api.uploadFile(pendingFile);
      } finally {
        setIsSendingAttachment(false);
      }
      messageType = attachment.mimeType.startsWith("image/") ? "IMAGE" : "FILE";
      if (!text) {
        encrypted = encryptMessage(`[Attachment] ${attachment.fileName}`);
      }
    }

    await joinChat(activeChatId);
    await sendTypingStop();
    try {
      await emitAck("send_message", {
        chatId: activeChatId,
        senderId: currentUser.id,
        encryptedContent: encrypted,
        messageType,
        replyToMessageId: replyTargetId ?? undefined,
        attachmentUrl: attachment?.url,
        fileName: attachment?.fileName,
        mimeType: attachment?.mimeType,
        fileSize: attachment?.fileSize,
      });
    } catch {
      await api.sendMessage({
        chatId: activeChatId,
        senderId: currentUser.id,
        encryptedContent: encrypted,
        messageType,
        replyToMessageId: replyTargetId ?? undefined,
        attachmentUrl: attachment?.url,
        fileName: attachment?.fileName,
        mimeType: attachment?.mimeType,
        fileSize: attachment?.fileSize,
      });
    }
    setDraft("");
    setPendingFile(null);
    setReplyTargetId(null);
    await refreshChat(activeChatId, currentUser.id);
    await refreshSummaries(currentUser.id);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    try {
      await emitAck("toggle_reaction", { messageId, userId: currentUser.id, emoji });
    } catch {
      await api.toggleReaction(messageId, currentUser.id, emoji);
    }
    await refreshChat(activeChatId, currentUser.id);
  }

  async function pinMessage(messageId: string) {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    await api.pinMessage(messageId, currentUser.id);
    await refreshSummaries(currentUser.id);
    await refreshChat(activeChatId, currentUser.id);
  }

  async function unpinMessage() {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    await api.unpinMessage(activeChatId, currentUser.id);
    await refreshSummaries(currentUser.id);
    await refreshChat(activeChatId, currentUser.id);
  }

  function dismissDeleteNotice(id: string) {
    setDismissedDeleteNoticeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  async function requestDeleteChatFromMenu() {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId || !activeSummary) return;
    const targetUserId = activeSummary.chat.memberIds.find((id) => id !== currentUser.id);
    if (!targetUserId) {
      setStatus("Delete request works for one-to-one chats.");
      return;
    }
    const targetName = targetUserId === activePeer?.id ? activePeer.name : resolveUserName(targetUserId);
    try {
      await api.createDeleteRequest(activeChatId, currentUser.id, targetUserId);
      setStatus(`Delete request sent to ${targetName}`);
      await refreshSummaries(currentUser.id);
    } catch (err) {
      const reason = extractApiError(err);
      if (reason.includes("DELETE_REQUEST_ALREADY_PENDING")) {
        setStatus(`Delete request already pending for ${targetName}.`);
      } else {
        setStatus(`Delete request failed: ${reason}`);
      }
    }
  }

  async function approveDeleteFromPopup(requestId: string) {
    if (!ensureBackend()) return;
    if (!currentUser) return;
    try {
      await api.approveDeleteRequest(requestId, currentUser.id);
      dismissDeleteNotice(requestId);
      setActiveChatId(null);
      setIsMobileChatOpen(false);
      setMessages([]);
      setDeleteRequests([]);
      setStatus("Delete approved. Chat removed for both users.");
      await refreshSummaries(currentUser.id);
    } catch (err) {
      setStatus(`Approve failed: ${extractApiError(err)}`);
    }
  }

  async function rejectDeleteFromPopup(request: DeleteRequest) {
    if (!ensureBackend()) return;
    if (!currentUser) return;
    try {
      await api.rejectDeleteRequest(request.id, currentUser.id);
      dismissDeleteNotice(request.id);
      setStatus("Delete request rejected.");
      if (activeChatId === request.chatId) {
        await refreshChat(request.chatId, currentUser.id);
      }
      await refreshSummaries(currentUser.id);
    } catch (err) {
      setStatus(`Reject failed: ${extractApiError(err)}`);
    }
  }

  function searchInActiveChat() {
    if (!activeChatId) return;
    const queryStr = window.prompt("Search in chat");
    if (!queryStr) return;
    const needle = queryStr.trim().toLowerCase();
    if (!needle) return;
    const match = decryptedMessages.find((m) => m.plainText.toLowerCase().includes(needle));
    if (match) {
      setStatus(`Found match: "${messageSnippet(match.plainText, match.fileName)}"`);
    } else {
      setStatus("No matching message found");
    }
  }

  async function createCommunity(commName: string, commDesc: string, commPrivacy: "PUBLIC" | "PRIVATE") {
    if (!ensureBackend()) return;
    if (!currentUser || !commName.trim()) return;
    await api.createCommunity(currentUser.id, commName.trim(), commDesc.trim(), commPrivacy);
    await refreshCommunities();
  }

  async function saveProfile(profileNameVal: string, profileEmailVal: string, avatarFile: File | null) {
    if (!ensureBackend()) return;
    if (!currentUser) return;
    setIsSavingProfile(true);
    try {
      let avatarUrl = currentUser.avatarUrl;
      if (avatarFile) {
        const upload = await api.uploadFile(avatarFile);
        avatarUrl = upload.url;
      }
      const updated = await api.updateProfile(currentUser.id, {
        name: profileNameVal.trim() || currentUser.name,
        email: profileEmailVal.trim() || undefined,
        avatarUrl,
      });
      setCurrentUser(updated);
      setStatus("Profile updated");
      await refreshSummaries(updated.id);
    } catch (err) {
      setStatus(`Profile update failed: ${(err as Error).message}`);
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleCallSignal(senderId: string, chatId: string, signal: string) {
    if (!currentUser) return;
    if (senderId === currentUser.id) return; // ignore own signals

    if (signal.startsWith("[CALL_INITIATED:")) {
      const parts = signal.split(":");
      const type = (parts[1] ?? "voice") as "voice" | "video";
      const partnerName = parts[2] ?? "Someone";

      setCallState("incoming");
      setCallType(type);
      setCallChatId(chatId);
      const peer = contacts.find((u) => u.id === senderId) || 
                   summaries.find((s) => s.peer?.id === senderId)?.peer || 
                   ({ id: senderId, name: partnerName, phone: "", createdAt: "" } as User);
      setCallPartner(peer);
    } else if (signal === "[CALL_ACCEPTED]") {
      setCallState("active");
      setCallDuration(0);
    } else if (signal === "[CALL_DECLINED]" || signal === "[CALL_ENDED]") {
      setCallState("idle");
      setCallPartner(null);
      setStatus(signal === "[CALL_DECLINED]" ? "Call was declined" : "Call ended");
    }
  }

  async function sendCallControlMessage(chatId: string, action: string) {
    if (!currentUser) return;
    const content = encryptMessage(action);
    try {
      await emitAck("send_message", {
        chatId,
        senderId: currentUser.id,
        encryptedContent: content,
        messageType: "SYSTEM"
      });
    } catch {
      await api.sendMessage({
        chatId,
        senderId: currentUser.id,
        encryptedContent: content,
        messageType: "SYSTEM"
      });
    }
  }

  async function initiateCall(type: "voice" | "video") {
    if (!activeChatId || !activePeer || !currentUser) return;
    setCallState("outgoing");
    setCallType(type);
    setCallChatId(activeChatId);
    setCallPartner(activePeer);
    await sendCallControlMessage(activeChatId, `[CALL_INITIATED:${type}:${currentUser.name}]`);
  }

  async function acceptCall() {
    if (!callChatId) return;
    setCallState("active");
    await sendCallControlMessage(callChatId, "[CALL_ACCEPTED]");
  }

  async function declineCall() {
    if (!callChatId) return;
    setCallState("idle");
    setCallPartner(null);
    await sendCallControlMessage(callChatId, "[CALL_DECLINED]");
  }

  async function endCall() {
    if (!callChatId) return;
    setCallState("idle");
    setCallPartner(null);
    await sendCallControlMessage(callChatId, "[CALL_ENDED]");
  }

  async function clearChatHistory() {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    const confirm = window.confirm("Are you sure you want to clear this chat history? This will permanently wipe all messages.");
    if (!confirm) return;
    try {
      await api.clearChatHistory(activeChatId, currentUser.id);
      setMessages([]);
      setStatus("Chat history cleared");
      await refreshSummaries(currentUser.id);
    } catch (err) {
      setStatus(`Failed to clear history: ${(err as Error).message}`);
    }
  }

  function signOutUser() {
    setCurrentUser(null);
    setActiveChatId(null);
    setDismissedDeleteNoticeIds([]);
    setMessages([]);
    setContacts([]);
    setSearch("");
    setReplyTargetId(null);
    setSeenByMessageId(null);
    setIsMobileChatOpen(false);
    setPendingFile(null);
    joinedChatsRef.current.clear();
    setCallState("idle");
    setCallPartner(null);
    setStatus("Logged out cleanly");
  }

  async function deleteAccount() {
    if (!currentUser) return;
    if (!ensureBackend()) return;
    const confirmed = window.confirm(
      "⚠️ Permanently delete your account?\n\nThis will:\n• Delete all your messages and chats\n• Remove you from all communities\n• Erase your profile completely\n\nThis action CANNOT be undone."
    );
    if (!confirmed) return;
    try {
      await api.deleteAccount(currentUser.id);
      signOutUser();
      setStatus("Account permanently deleted.");
    } catch (err) {
      setStatus(`Delete account failed: ${(err as Error).message}`);
    }
  }

  const handleCustomWallpaperChange = (url: string | null) => {
    setCustomWallpaper(url);
    if (url) {
      localStorage.setItem("custom_wallpaper", url);
    } else {
      localStorage.removeItem("custom_wallpaper");
    }
  };

  async function handleScreenshotAttempt() {
    if (!activeChatId || !currentUser) return;
    try {
      // Send security warning message
      const content = encryptMessage("⚠️ [SECURITY] Screenshot attempt detected. Chat history will be cleared.");
      await api.sendMessage({
        chatId: activeChatId,
        senderId: currentUser.id,
        encryptedContent: content,
        messageType: "TEXT",
      });
      // Wipe the entire conversation history
      await api.clearChatHistory(activeChatId, currentUser.id);
      setMessages([]);
      setStatus("Chat wiped due to screenshot attempt.");
      await refreshSummaries(currentUser.id);
    } catch (err) {
      console.warn("Screenshot handler failed:", err);
    }
  }

  return (
    <main className="app-shell" data-theme={theme}>
      {/* Visual background layers */}
      <div className="ambient-background" />

      {/* Auth Gate User */}
      {!currentUser && (
        <AuthPage
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          backendReady={backendReady}
          status={status}
          socketConnected={socketConnected}
        />
      )}

      {/* Main Workspace Regular User */}
      {currentUser && (
        <MainApp
          currentUser={currentUser}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          userTab={userTab}
          setUserTab={setUserTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          chatWallpaperIndex={chatWallpaperIndex}
          setChatWallpaperIndex={setChatWallpaperIndex}
          isMobileChatOpen={isMobileChatOpen}
          setIsMobileChatOpen={setIsMobileChatOpen}
          onlineUsers={onlineUsers}
          backendReady={backendReady}
          socketConnected={socketConnected}
          status={status}
          summaries={summaries}
          contacts={contacts}
          communities={communities}
          messages={messages}
          decryptedMessages={decryptedMessages}
          messageMap={messageMap}
          replyTargetId={replyTargetId}
          setReplyTargetId={setReplyTargetId}
          seenByMessageId={seenByMessageId}
          setSeenByMessageId={setSeenByMessageId}
          pendingFile={pendingFile}
          setPendingFile={setPendingFile}
          isSendingAttachment={isSendingAttachment}
          draft={draft}
          setDraft={setDraft}
          incomingDeleteRequest={incomingDeleteRequest}
          rejectedDeleteRequestForMe={rejectedDeleteRequestForMe}
          dismissDeleteNotice={dismissDeleteNotice}
          approveDeleteFromPopup={approveDeleteFromPopup}
          rejectDeleteFromPopup={rejectDeleteFromPopup}
          onSendMessage={sendMessage}
          onToggleReaction={toggleReaction}
          onPinMessage={pinMessage}
          onUnpinMessage={unpinMessage}
          onRequestDeleteChat={requestDeleteChatFromMenu}
          onClearChatHistory={clearChatHistory}
          onInitiateCall={initiateCall}
          onSearchInChat={searchInActiveChat}
          onStartChat={startChat}
          onOpenChat={openChat}
          onCreateCommunity={createCommunity}
          onSaveProfile={saveProfile}
          onSignOut={signOutUser}
          onDeleteAccount={deleteAccount}
          onScreenshotAttempt={handleScreenshotAttempt}
          customWallpaper={customWallpaper}
          onCustomWallpaperChange={handleCustomWallpaperChange}
          onRefreshSummaries={() => void refreshSummaries(currentUser.id)}
          onRefreshContacts={() => void refreshContacts(currentUser.id)}
          onSendTypingStart={sendTypingStart}
          onSendTypingStop={sendTypingStop}
          resolveUrl={resolveAttachmentUrl}
          formatLastSeen={formatLastSeen}
          formatChatTime={formatChatTime}
          formatMessageDay={formatMessageDay}
          getReactedUsers={getReactedUsers}
          userListLabel={userListLabel}
          getDeliveryLabel={getDeliveryLabel}
          isAutoAttachmentText={isAutoAttachmentText}
          messageSnippet={messageSnippet}
          resolveUserName={resolveUserName}
          activeTypingUsers={activeTypingUsers}
          activePeer={activePeer}
          activeChatTitle={activeChatTitle}
          activeChatStatus={activeChatStatus}
        />
      )}

      {/* Call Overlay UI */}
      {callState !== "idle" && (
        <div className="call-overlay-modal animate-fade-in">
          <div className="call-modal-card animate-scale-up">
            <div className="call-card-header">
              <div className={`call-avatar-pulse ${callState === "outgoing" || callState === "incoming" ? "pulsing" : ""}`}>
                <Avatar
                  name={callPartner?.name ?? "Partner"}
                  avatarUrl={callPartner?.avatarUrl}
                  size="xl"
                  resolveUrl={resolveAttachmentUrl}
                />
              </div>
              <h2>{callPartner?.name ?? "Secure Call"}</h2>
              <p className="call-subtitle">
                {callState === "outgoing" && "Calling..."}
                {callState === "incoming" && `Incoming ${callType} call...`}
                {callState === "active" && `Secure ${callType} call connected`}
              </p>
              {callState === "active" && (
                <div className="call-timer">
                  {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                </div>
              )}
            </div>

            {callState === "active" && callType === "video" && (
              <div className="call-video-grid">
                <div className="video-viewport local-video-viewport">
                  {localStream ? (
                    <video
                      ref={(el) => {
                        if (el) el.srcObject = localStream;
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="call-video-element"
                    />
                  ) : (
                    <div className="video-fallback-avatar">
                      <span>You (Camera Off)</span>
                    </div>
                  )}
                </div>
                <div className="video-viewport remote-video-viewport">
                  <div className="simulated-peer-stream">
                    <Avatar
                      name={callPartner?.name ?? "Peer"}
                      avatarUrl={callPartner?.avatarUrl}
                      size="xl"
                      resolveUrl={resolveAttachmentUrl}
                    />
                    <div className="simulated-peer-scanline" />
                    <span>Secure Video Feed</span>
                  </div>
                </div>
              </div>
            )}

            <div className="call-controls-row">
              {callState === "incoming" ? (
                <>
                  <button className="btn btn-success call-btn accept-btn" onClick={acceptCall}>
                    📞 Accept
                  </button>
                  <button className="btn btn-danger call-btn decline-btn" onClick={declineCall}>
                    ❌ Decline
                  </button>
                </>
              ) : (
                <button className="btn btn-danger call-btn end-btn" onClick={endCall}>
                  🛑 End Call
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
