import { useMemo, useRef, useState } from "react";
import Avatar from "../components/Avatar";
import { SearchIcon, RefreshIcon, ChatIcon, CloseIcon, PlusIcon, LockIcon } from "../components/Icons";
import { api } from "../api";
import type { User } from "../types";
import { contactPickerSupported, inviteText, parseContactsFile, pickPhoneContacts } from "../features/contactImport";

interface ContactsPanelProps {
  currentUserId: string;
  contacts: User[];
  onStartChat: (peer: User) => void;
  onRefresh: () => void;
  backendReady: boolean;
  resolveUrl: (url?: string) => string;
  formatLastSeen: (time?: string) => string;
}

type Result = { found: number; notOnApp: string[] } | null;

function friendlyError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/DAILY_CONTACT_CHECK_LIMIT/.test(msg)) return "You've checked a lot of contacts today. Please try again tomorrow.";
  if (/NOT_ON_ELISECURECHAT/.test(msg)) return "NOT_ON_APP";
  if (/valid phone number or email/i.test(msg)) return "Enter a valid phone number (with country code if outside India) or an email address.";
  return "Something went wrong. Please try again.";
}

/**
 * Contacts, the WhatsApp/Telegram way: only people who are in your address book (or whose number/email you add)
 * AND use EliSecureChat appear here. Nobody can browse a list of all users.
 */
export default function ContactsPanel({ currentUserId, contacts, onStartChat, onRefresh, backendReady, resolveUrl, formatLastSeen }: ContactsPanelProps) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "invite"; text: string; target?: string } | null>(null);
  const [result, setResult] = useState<Result>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const appUrl = window.location.origin;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((u) => u.name.toLowerCase().includes(needle) || u.phone.includes(needle));
  }, [contacts, query]);

  const invite = async (to?: string) => {
    const text = inviteText(appUrl);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on EliSecureChat", text });
        return;
      }
    } catch {
      return; // the person closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ kind: "ok", text: `Invite message copied${to ? ` for ${to}` : ""}. Paste it into WhatsApp, SMS or email.` });
    } catch {
      window.prompt("Copy this invite message:", text);
    }
  };

  const check = async (entries: string[]) => {
    if (!entries.length) {
      setMessage({ kind: "error", text: "No phone numbers or emails were found." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.discoverContacts(currentUserId, entries);
      setResult({ found: r.matches.length, notOnApp: r.notOnApp });
      onRefresh();
    } catch (err) {
      setMessage({ kind: "error", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };

  const addOne = async () => {
    const id = identifier.trim();
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      const u = await api.addContact(currentUserId, id);
      setMessage({ kind: "ok", text: `${u.name} is on EliSecureChat and was added to your contacts.` });
      setIdentifier("");
      setAdding(false);
      onRefresh();
    } catch (err) {
      const f = friendlyError(err);
      if (f === "NOT_ON_APP") setMessage({ kind: "invite", text: `${id} isn't on EliSecureChat yet.`, target: id });
      else setMessage({ kind: "error", text: f });
    } finally {
      setBusy(false);
    }
  };

  const fromPhone = async () => {
    try {
      const entries = await pickPhoneContacts();
      if (entries) await check(entries);
    } catch {
      setMessage({ kind: "error", text: "Your phone's contacts couldn't be opened." });
    }
  };

  const fromFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: "error", text: "That file is too large (over 5 MB)." });
      return;
    }
    await check(parseContactsFile(await file.text()));
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (u: User) => {
    if (!window.confirm(`Remove ${u.name} from your contacts? Your chats stay.`)) return;
    try {
      await api.removeContact(currentUserId, u.id);
      onRefresh();
    } catch (err) {
      setMessage({ kind: "error", text: friendlyError(err) });
    }
  };

  return (
    <div className="contacts-panel-container animate-fade-in">
      <div className="panel-header">
        <h2>Contacts</h2>
        <button className="btn-icon" onClick={onRefresh} disabled={!backendReady} title="Refresh contacts" aria-label="Refresh contacts">
          <RefreshIcon size={18} />
        </button>
      </div>

      <div className="contacts-find">
        <p className="contacts-privacy">
          <LockIcon size={13} /> Only people in your contacts who use EliSecureChat appear here. Nobody can browse a list of all users.
        </p>
        <div className="contacts-find-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding((v) => !v)} disabled={!backendReady || busy}>
            <PlusIcon size={14} /> Add by phone or email
          </button>
          {contactPickerSupported() && (
            <button className="btn btn-secondary btn-sm" onClick={() => void fromPhone()} disabled={!backendReady || busy}>
              Find from my phone contacts
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={!backendReady || busy}>
            Import contacts file
          </button>
          <input ref={fileRef} type="file" accept=".vcf,.csv,text/vcard,text/csv" hidden onChange={(e) => void fromFile(e.target.files?.[0])} />
        </div>
        {adding && (
          <form className="contacts-add-form" onSubmit={(e) => { e.preventDefault(); void addOne(); }}>
            <input
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Phone number (98765 43210) or email"
              aria-label="Phone number or email"
              inputMode="email"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !identifier.trim()}>{busy ? "Checking…" : "Add"}</button>
          </form>
        )}
        {busy && <p className="contacts-status">Checking which of your contacts use EliSecureChat…</p>}
        {result && !busy && (
          <div className="contacts-result" role="status">
            <strong>{result.found ? `${result.found} of your contacts ${result.found === 1 ? "is" : "are"} on EliSecureChat` : "None of these contacts use EliSecureChat yet"}</strong>
            {result.notOnApp.length > 0 && (
              <span>
                {result.notOnApp.length} {result.notOnApp.length === 1 ? "isn't" : "aren't"} on it yet.{" "}
                <button type="button" className="home-link" onClick={() => void invite()}>Invite them</button>
              </span>
            )}
            <button type="button" className="contacts-result-x" onClick={() => setResult(null)} aria-label="Dismiss"><CloseIcon size={14} /></button>
          </div>
        )}
        {message && (
          <div className={`contacts-message ${message.kind}`} role="status">
            <span>{message.text}</span>
            {message.kind === "invite" && <button type="button" className="btn btn-primary btn-xs" onClick={() => void invite(message.target)}>Invite</button>}
          </div>
        )}
        <p className="contacts-hint">
          Tip: on a computer, export your contacts from Google Contacts (Export → vCard) and import the file here. The file is read on your device; only the numbers and emails are checked, and the list isn't stored.
        </p>
      </div>

      {contacts.length > 0 && (
        <div className="search-bar-container">
          <SearchIcon size={18} className="search-bar-icon" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your contacts" className="search-input" />
        </div>
      )}

      <div className="scroll-container contacts-list-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state-box">
            <h3>{contacts.length ? "No contacts match" : "No contacts yet"}</h3>
            <p>{contacts.length ? "Try a different name." : "Add someone by phone number or email, or check your phone contacts, to see who's on EliSecureChat."}</p>
          </div>
        ) : (
          <ul className="contacts-cards-grid">
            {filtered.map((u) => (
              <li key={u.id} className="contact-card-wrapper animate-slide-up">
                <div className="contact-card-header">
                  <Avatar name={u.name} avatarUrl={u.avatarUrl} size="md" resolveUrl={resolveUrl} />
                  <div className="contact-card-meta">
                    <span className="contact-card-name">{u.name}</span>
                    <span className="contact-card-status">{formatLastSeen(u.lastSeenAt)}</span>
                  </div>
                  <button className="contact-remove" onClick={() => void remove(u)} title="Remove from contacts" aria-label={`Remove ${u.name} from contacts`}>
                    <CloseIcon size={14} />
                  </button>
                </div>
                <div className="contact-card-details">
                  <div className="detail-item">
                    <span className="detail-label">Phone:</span>
                    <span className="detail-value">{u.phone}</span>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => onStartChat(u)}>
                  <ChatIcon size={14} style={{ marginRight: "6px", display: "inline-block" }} /> Message
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
