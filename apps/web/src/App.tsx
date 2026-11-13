import { FormEvent, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { applyAccessibility, flashVisualAlert } from "./preferences";
import { applyAppearance, cachedAppearance } from "./theme";
import { richLabel } from "./stickers/expressions";
import { capsuleLabel } from "./features/capsule";
import { api } from "./api";
import { absoluteUrl } from "./config";
import { getAccessToken, logoutSession, onSessionChange, refreshSession, setSession, withMediaToken } from "./session";
import { e2ee, MissingKeysError } from "./e2ee/e2ee";
import { socket } from "./socket";
import type { AdminOverview, ChatSummary, Community, DeleteRequest, LoginResponse, Message, User, PreferencesPatch, UserPreferences, Appearance, WallpaperId } from "./types";
import AuthPage from "./pages/AuthPage";
import MainApp from "./pages/MainApp";
import Avatar from "./components/Avatar";
import { LockIcon } from "./components/Icons";
import BrandSplash from "./components/BrandSplash";
import { CallManager, type CallSnapshot } from "./call/CallManager";
import CallScreen from "./call/CallScreen";

type UserTab = "chats" | "contacts" | "communities" | "translator" | "settings" | "profile";

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

/**
 * Cheap fingerprint of polled data. Polling runs every couple of seconds; when nothing changed we skip the state
 * update so React does not re-render (and re-decrypt) every message. Large envelopes are reduced to length + tail.
 */
function fingerprint(value: unknown): string {
  return JSON.stringify(value, (k, v) => (k === "encryptedContent" && typeof v === "string" ? `${v.length}:${v.slice(-24)}` : v));
}

export function App() {
  const [userTab, setUserTab] = useState<UserTab>("chats");
  const [status, setStatus] = useState("Ready");
  const [backendReady, setBackendReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  // Call states
  // Real WebRTC calls (SignConnect Phase 3/8)
  const callManager = useMemo(() => new CallManager(socket), []);

  const [name, setName] = useState("User One");
  const [phone, setPhone] = useState("9000000001");
  const [email, setEmail] = useState("user1@example.com");
  const [password, setPassword] = useState("secret123");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // false until we've tried to restore a session from the httpOnly refresh cookie
  const [sessionChecked, setSessionChecked] = useState(false);
  // bumps when the access token changes, so media URLs (which carry it) re-render
  const [, setTokenVersion] = useState(0);
  // bumps when background decryption finishes, so message text re-renders
  const [e2eeVersion, setE2eeVersion] = useState(0);
  const [e2eeError, setE2eeError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const hadUserRef = useRef(false);

  // AURA brand splash: play whenever a session starts (sign-in or restored session)
  useEffect(() => {
    if (currentUser && !hadUserRef.current) setShowSplash(true);
    hadUserRef.current = Boolean(currentUser);
  }, [currentUser]);

  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(cachedAppearance);
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
    () => messages.map((m) => ({ ...m, plainText: e2ee.view(m.encryptedContent).text })),
    // e2eeVersion: recompute when background decryption finishes, not only when the message list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, e2eeVersion],
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


  // Stay signed in across reloads: exchange the httpOnly refresh cookie for a fresh access token.
  useEffect(() => {
    if (!backendReady || sessionChecked) return;
    let alive = true;
    void refreshSession().then((s) => {
      if (!alive) return;
      if (s) setCurrentUser(s.user);
      setSessionChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [backendReady, sessionChecked]);

  useEffect(() => {
    if (e2ee.ready) void e2ee.decryptAll(messages);
  }, [messages, e2eeVersion]);
  useEffect(() => {
    if (e2ee.ready) void e2ee.decryptAll(summaries.flatMap((s) => (s.lastMessage ? [s.lastMessage] : [])));
  }, [summaries, e2eeVersion]);

  // End-to-end encryption: load/create this device's keys once signed in.
  useEffect(() => e2ee.subscribe(() => setE2eeVersion(e2ee.version)), []);
  useEffect(() => {
    if (!currentUser) {
      e2ee.reset();
      return;
    }
    setE2eeError(null);
    e2ee.init(currentUser.id).catch((err: Error) => setE2eeError(`End-to-end encryption is unavailable on this device: ${err.message}`));
  }, [currentUser?.id]);

  // If the session ends (expired, revoked from another device, password changed), sign out locally.
  useEffect(
    () =>
      onSessionChange(({ token }) => {
        setTokenVersion((v) => v + 1);
        if (!token) {
          setCurrentUser((cur) => {
            if (cur) setStatus("Your session ended. Please sign in again.");
            return null;
          });
        }
      }),
    [],
  );

  // The server rejects sockets with an expired token: refresh once, then reconnect.
  useEffect(() => {
    const onAuthError = () => {
      void refreshSession().then((s) => {
        if (s) socket.connect();
      });
    };
    socket.on("auth_error", onAuthError);
    return () => {
      socket.off("auth_error", onAuthError);
    };
  }, []);

  // SignConnect Phase 1a: load language/accessibility preferences for the signed-in user
  useEffect(() => {
    if (!currentUser) {
      setPreferences(null);
      applyAccessibility(null);
      return;
    }
    let alive = true;
    api
      .getPreferences(currentUser.id)
      .then((prefs) => {
        if (!alive) return;
        setPreferences(prefs);
        applyAccessibility(prefs);
        // Signers: warm up the on-device vision model now, so sign detection is instant when a call starts.
        if (prefs.preferredSignLanguage) {
          // The first inference compiles GPU shaders and can briefly block the page, so do it when the browser
          // is idle, a few seconds after sign-in, and never in the middle of a call.
          const warm = () => {
            if (callManager.snapshot && callManager.snapshot.phase !== "ended") return;
            void import("./ai/handTracker")
              .then((m) => m.getHandTracker())
              .catch((err: Error) => console.warn("Vision model preload failed (will retry in the call):", err.message));
          };
          window.setTimeout(() => {
            if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 15000 });
            else warm();
          }, 5000);
        }
        if (prefs.appearance) {
          setAppearance(prefs.appearance);
          applyAppearance(prefs.appearance);
        }
        // "system" means no explicit choice, so the local/device theme stays in charge.
        if (prefs.theme === "light" || prefs.theme === "dark") {
          setTheme(prefs.theme);
          document.documentElement.setAttribute("data-theme", prefs.theme);
          localStorage.setItem("theme", prefs.theme);
        }
      })
      .catch((err: Error) => alive && setStatus(`Could not load your preferences: ${err.message}`));
    return () => {
      alive = false;
    };
  }, [currentUser?.id]);

  const updatePreferences = async (patch: PreferencesPatch) => {
    if (!currentUser || !preferences) return;
    const previous = preferences;
    const optimistic: UserPreferences = {
      ...previous,
      ...patch,
      accessibility: { ...previous.accessibility, ...(patch.accessibility ?? {}) },
      voice: { ...previous.voice, ...(patch.voice ?? {}) },
      appearance: { ...previous.appearance, ...(patch.appearance ?? {}) },
    };
    setPreferences(optimistic);
    applyAccessibility(optimistic);
    try {
      const saved = await api.updatePreferences(currentUser.id, patch);
      setPreferences(saved);
      applyAccessibility(saved);
    } catch (err) {
      setPreferences(previous);
      applyAccessibility(previous);
      throw err;
    }
  };

  /** Design, accent, bubble style or wallpaper changed in Settings: show it at once, then save it to the profile. */
  const updateAppearance = (patch: Partial<Appearance>) => {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    applyAppearance(next);
    if (currentUser) {
      api
        .updatePreferences(currentUser.id, { appearance: patch })
        .then(setPreferences)
        .catch((err: Error) => setStatus(`Appearance not saved to your profile: ${err.message}`));
    }
  };
  const setChatWallpaper = (wallpaper: WallpaperId) => updateAppearance({ wallpaper });

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
    if (currentUser) {
      api
        .updatePreferences(currentUser.id, { theme: nextTheme })
        .then(setPreferences)
        .catch((err: Error) => setStatus(`Theme not saved to your profile: ${err.message}`));
    }
  };

  useEffect(() => {
    callManager.attach();
    // Only the call layer re-renders on snapshot updates (stats, captions, signs); App just raises the alert.
    let lastPhase: string | undefined;
    const unsubscribe = callManager.subscribe((snap) => {
      if (snap?.phase === "incoming" && lastPhase !== "incoming") flashVisualAlert();
      lastPhase = snap?.phase;
    });
    return () => {
      unsubscribe();
      callManager.detach();
    };
  }, [callManager]);

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
    const onConnect = () => {
      setSocketConnected(true);
      joinedChatsRef.current.clear();
      if (!currentUser) return;
      void (async () => {
        try {
          await registerPresence(currentUser.id);
          if (activeChatId) await joinChat(activeChatId);
        } catch (err) {
          setStatus(`Reconnected, but live sync failed: ${(err as Error).message}`);
        }
      })();
    };
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


      if (m.chatId === activeChatId) {
        setMessages((prev) => (prev.some((x) => x.id === incoming.id) ? prev : [...prev.map(normalizeMessageShape), incoming]));
      }
      if (currentUser && m.senderId !== currentUser.id) {
        flashVisualAlert();
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

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence_update", onPresence);
      socket.off("typing_update", onTyping);
      socket.off("messages_read", onRead);
      socket.off("messages_delivered", onDelivered);
      socket.off("reaction_update", onReaction);
      socket.off("receive_message", onReceive);
    };
  }, [activeChatId, currentUser, backendReady]);

  // The connection itself lives as long as a user is signed in and the backend is reachable.
  useEffect(() => {
    if (!currentUser || !backendReady || !getAccessToken()) return;
    if (!socket.connected) socket.connect();
    return () => {
      socket.disconnect();
      joinedChatsRef.current.clear();
    };
  }, [currentUser?.id, backendReady]);

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
    // Fallback sync for the open chat. Live updates arrive over the socket; during a call the poll pauses so the
    // call (and on-device sign/speech AI) keeps the main thread.
    const t = setInterval(() => {
      if (callManager.snapshot && callManager.snapshot.phase !== "ended") return;
      void refreshChat(activeChatId, currentUser.id);
    }, 1700);
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
    return withMediaToken(absoluteUrl(attachmentUrl));
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
    const rich = richLabel(text) ?? capsuleLabel(text);
    if (rich) return rich;
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
    // Keep the current arrays when nothing changed, so React skips the re-render.
    setSummaries((prev) => (fingerprint(prev) === fingerprint(nextSummaries) ? prev : nextSummaries));
    setDeleteRequests((prev) => (fingerprint(prev) === fingerprint(nextDeleteRequests) ? prev : nextDeleteRequests));
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
    const fp = fingerprint(normalized);
    setMessages((prev) => (fingerprint(prev) === fp ? prev : normalized));
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
      setSession(result);
      setCurrentUser(result.user);
      setStatus("Signed in");
    } catch (err) {
      setStatus(`Sign in failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Verified sign-up finished (codes confirmed): the server already created the account and a session. */
  function handleSignedUp(result: LoginResponse) {
    setSession(result);
    setCurrentUser(result.user);
    setStatus("Account created. Welcome!");
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

  /** richText: a sticker or GIF (sent as encrypted text) - leaves the typed draft alone. */
  async function sendMessage(voiceFile?: File, richText?: string) {
    if (!ensureBackend()) return;
    if (!currentUser || !activeChatId) return;
    const file = richText ? null : voiceFile ?? pendingFile;
    if (!voiceFile && !richText && !draft.trim() && !pendingFile) return;

    const text = richText ?? (voiceFile ? "" : draft.trim());
    const memberIds = summaries.find((s) => s.chat.id === activeChatId)?.chat.memberIds ?? [currentUser.id];
    const seal = async (plain: string) => {
      try {
        return await e2ee.encryptFor(activeChatId, memberIds, plain);
      } catch (err) {
        if (err instanceof MissingKeysError) {
          const names = err.userIds.map((id) => resolveUserName(id)).join(", ");
          throw new Error(`${names} hasn't set up end-to-end encryption yet. They need to sign in once on the updated app before you can message them.`);
        }
        throw err;
      }
    };
    let encrypted = "";
    try {
      if (text) encrypted = await seal(text);
    } catch (err) {
      setStatus(`Message not sent: ${(err as Error).message}`);
      return;
    }
    let messageType: Message["messageType"] = "TEXT";
    let attachment:
      | {
          url: string;
          fileName: string;
          mimeType: string;
          fileSize: number;
        }
      | undefined;

    if (file) {
      setIsSendingAttachment(true);
      try {
        attachment = await api.uploadFile(file);
        messageType = attachment.mimeType.startsWith("image/") ? "IMAGE" : attachment.mimeType.startsWith("audio/") ? "AUDIO" : "FILE";
        if (!text) encrypted = await seal(messageType === "AUDIO" ? "🎤 Voice message" : `[Attachment] ${attachment.fileName}`);
      } catch (err) {
        setStatus(`Not sent: ${(err as Error).message}`);
        return;
      } finally {
        setIsSendingAttachment(false);
      }
    }
    if (!encrypted) return;

    await joinChat(activeChatId);
    await sendTypingStop();
    let ack: { ok?: boolean; error?: string } | undefined;
    try {
      ack = await emitAck<{ ok?: boolean; error?: string }>("send_message", {
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
      ack = undefined; // socket timeout: fall back to HTTP below
    }
    if (ack?.ok === false) {
      // The server refused (not a network problem): say so instead of silently dropping the message.
      const why: Record<string, string> = {
        BLOCKED: "one of you has blocked the other",
        NOT_A_CHAT_MEMBER: "you are not a member of this chat",
        INVALID_CONTENT: "the message is too large",
        NOT_AUTHENTICATED: "your session expired, please sign in again",
      };
      setStatus(`Message not sent: ${why[ack.error ?? ""] ?? ack.error ?? "refused by the server"}.`);
      return;
    }
    if (!ack) {
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
    if (!voiceFile && !richText) {
      setDraft("");
      setPendingFile(null);
    }
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

  async function initiateCall(type: "voice" | "video") {
    if (!activeChatId || !activePeer || !currentUser) return;
    try {
      await callManager.start(activeChatId, type === "video" ? "VIDEO" : "AUDIO", {
        id: activePeer.id,
        name: activePeer.name,
        avatarUrl: activePeer.avatarUrl,
      });
    } catch (err) {
      setStatus((err as Error).message);
    }
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
    void logoutSession(); // revokes this device's session on the server and clears the cookie
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
    void callManager.hangup();
    callManager.dismiss();
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

  /** Block or unblock the other person in a 1:1 chat (enforced by the server for messages and calls). */
  async function toggleBlock(peerId: string) {
    if (!currentUser) return;
    const blocked = currentUser.blockedUserIds?.includes(peerId);
    try {
      const r = blocked ? await api.unblockUser(currentUser.id, peerId) : await api.blockUser(currentUser.id, peerId);
      setCurrentUser({ ...currentUser, blockedUserIds: r.blocked });
      setStatus(blocked ? "Unblocked." : "Blocked. They can no longer message or call you.");
    } catch (err) {
      setStatus(`Could not update block: ${(err as Error).message}`);
    }
  }

  async function handleScreenshotAttempt() {
    if (!activeChatId || !currentUser) return;
    try {
      // Send an (end-to-end encrypted) security warning; if encryption isn't possible, skip it rather than send plaintext.
      const memberIds = summaries.find((x) => x.chat.id === activeChatId)?.chat.memberIds ?? [currentUser.id];
      const content = await e2ee
        .encryptFor(activeChatId, memberIds, "⚠️ [SECURITY] Screenshot attempt detected. Chat history will be cleared.")
        .catch(() => null);
      if (content) {
        await api.sendMessage({
          chatId: activeChatId,
          senderId: currentUser.id,
          encryptedContent: content,
          messageType: "TEXT",
        });
      }
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
      {!currentUser && (sessionChecked || !backendReady) && (
        <AuthPage
          onSignIn={handleSignIn}
          onSignedUp={handleSignedUp}
          backendReady={backendReady}
          status={status}
          socketConnected={socketConnected}
        />
      )}

      {showSplash && currentUser && <BrandSplash onDone={() => setShowSplash(false)} />}

      {/* Main Workspace Regular User */}
      {currentUser && (
        <MainApp
          currentUser={currentUser}
          preferences={preferences}
          onUpdatePreferences={updatePreferences}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          userTab={userTab}
          setUserTab={setUserTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          chatWallpaper={appearance.wallpaper}
          setChatWallpaper={setChatWallpaper}
          appearance={appearance}
          onUpdateAppearance={updateAppearance}
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
          onSendMessage={() => sendMessage()}
          onSendRich={(text: string) => sendMessage(undefined, text)}
          onSendVoice={(f: File) => sendMessage(f)}
          onToggleBlock={toggleBlock}
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

      {currentUser && (
        <CallLayer manager={callManager} currentUserId={currentUser.id} preferences={preferences} resolveUrl={resolveAttachmentUrl} />
      )}
    </main>
  );
}

/**
 * Subscribes to call snapshots on its own, so frequent call updates re-render only the call screen and not the
 * chat behind it. That keeps the main thread free for on-device sign and speech recognition.
 */
function CallLayer({ manager, ...rest }: { manager: CallManager } & Omit<ComponentProps<typeof CallScreen>, "manager" | "snap">) {
  const [snap, setSnap] = useState<CallSnapshot | null>(manager.snapshot);
  useEffect(() => manager.subscribe(setSnap), [manager]);
  if (!snap) return null;
  return <CallScreen manager={manager} snap={snap} {...rest} />;
}
