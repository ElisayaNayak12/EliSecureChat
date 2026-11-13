import type { ReactNode } from "react";
import type { ChatSummary, User, UserPreferences } from "../types";
import Avatar from "./Avatar";
import { ChatIcon, GroupIcon, HandIcon, LockIcon, SettingsIcon, ShieldIcon, CheckIcon } from "./Icons";
import { LeafySticker, STICKERS } from "../stickers/leafy";

type Tab = "chats" | "contacts" | "communities" | "translator" | "settings" | "profile";

type Props = {
  currentUser: User;
  summaries: ChatSummary[];
  preferences: UserPreferences | null;
  backendReady: boolean;
  socketConnected: boolean;
  onOpenChat: (s: ChatSummary) => void;
  goTo: (tab: Tab) => void;
  previewOf: (s: ChatSummary) => string;
  resolveUrl: (url?: string) => string;
  onlineUsers: Set<string>;
};

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** What people see before they open a chat: greeting, quick actions, recent chats and a security checkup. */
export default function HomeDashboard({ currentUser, summaries, preferences, backendReady, socketConnected, onOpenChat, goTo, previewOf, resolveUrl, onlineUsers }: Props) {
  const now = new Date();
  const first = currentUser.name.split(" ")[0];
  const recent = [...summaries].sort((a, b) => +new Date(b.lastMessage?.createdAt ?? b.updatedAt) - +new Date(a.lastMessage?.createdAt ?? a.updatedAt)).slice(0, 4);
  const unread = summaries.reduce((n, s) => n + s.unreadCount, 0);

  const actions: { title: string; desc: string; icon: ReactNode; tone: string; onClick: () => void }[] = [
    { title: "New chat", desc: "Message anyone from your contacts.", icon: <ChatIcon size={22} />, tone: "t1", onClick: () => goTo("contacts") },
    { title: "New group", desc: "Bring family, friends or a team together.", icon: <GroupIcon size={22} />, tone: "t2", onClick: () => goTo("communities") },
    { title: "Sign translator", desc: "Practise signs and translate on your device.", icon: <HandIcon size={22} />, tone: "t3", onClick: () => goTo("translator") },
    { title: "Appearance", desc: "5 designs, wallpapers and colours.", icon: <SettingsIcon size={22} />, tone: "t4", onClick: () => goTo("settings") },
  ];

  const checks: { label: string; done: boolean; action?: () => void }[] = [
    { label: "End-to-end encryption on this device", done: true },
    { label: "Email address verified", done: Boolean(currentUser.email), action: () => goTo("profile") },
    { label: "Language and sign language chosen", done: Boolean(preferences?.preferredLanguage && preferences.preferredSignLanguage !== undefined && preferences.updatedAt), action: () => goTo("settings") },
    { label: "Secure connection", done: backendReady && socketConnected },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const newSticker = STICKERS.find((s) => s.id === "hello")!;

  return (
    <div className="home-dash animate-fade-in">
      <header className="home-head">
        <span className="home-date">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        <h2>{greeting(now)}, {first}</h2>
        <p>{unread > 0 ? `You have ${unread} unread message${unread === 1 ? "" : "s"}.` : "You're all caught up."} Everything you send is end-to-end encrypted.</p>
      </header>

      <section className="home-actions" aria-label="Quick actions">
        {actions.map((a) => (
          <button key={a.title} type="button" className="home-action" onClick={a.onClick}>
            <span className={`home-action-icon ${a.tone}`}>{a.icon}</span>
            <strong>{a.title}</strong>
            <span>{a.desc}</span>
          </button>
        ))}
      </section>

      <div className="home-grid">
        <section className="home-card">
          <div className="home-card-head">
            <h3>Continue chatting</h3>
            <button type="button" className="home-link" onClick={() => goTo("chats")}>All chats</button>
          </div>
          {recent.length === 0 ? (
            <p className="home-muted">No chats yet. Start one from your contacts.</p>
          ) : (
            <ul className="home-recent">
              {recent.map((s) => {
                const name = s.peer?.name ?? s.chat.title ?? "Chat";
                return (
                  <li key={s.chat.id}>
                    <button type="button" onClick={() => onOpenChat(s)}>
                      <Avatar name={name} avatarUrl={s.peer?.avatarUrl} size="md" resolveUrl={resolveUrl} isOnline={s.peer ? onlineUsers.has(s.peer.id) : undefined} />
                      <span className="hr-main">
                        <strong>{name}</strong>
                        <span>{previewOf(s)}</span>
                      </span>
                      {s.unreadCount > 0 && <span className="unread-badge">{s.unreadCount}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <h3>Security checkup</h3>
            <span className="home-score">{doneCount} of {checks.length}</span>
          </div>
          <div className="home-progress"><span style={{ width: `${(doneCount / checks.length) * 100}%` }} /></div>
          <ul className="home-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.done ? "done" : ""}>
                <span className="hc-mark">{c.done ? <CheckIcon size={14} /> : <ShieldIcon size={14} />}</span>
                <span>{c.label}</span>
                {!c.done && c.action && <button type="button" className="home-link" onClick={c.action}>Set up</button>}
              </li>
            ))}
          </ul>
          <p className="home-muted small"><LockIcon size={12} /> Your messages and calls can only be read by the people in the chat.</p>
        </section>

        <section className="home-card home-new">
          <LeafySticker sticker={newSticker} size={92} />
          <div>
            <span className="home-new-tag">New</span>
            <h3>Leafy stickers, mood emoji and GIFs</h3>
            <p className="home-muted">{STICKERS.length} stickers for every mood. Type “thanks” or “happy birthday” in a chat to see suggestions.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
