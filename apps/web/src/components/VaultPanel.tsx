import { useState } from "react";
import type { ChatSummary } from "../types";
import { createVault, deleteVault, hiddenChatIds, pinProblem, setChatHidden, unlockVault, vaultExists } from "../features/vault";
import { LockIcon, CloseIcon } from "./Icons";

type Props = {
  userId: string;
  summaries: ChatSummary[];
  onOpenChat: (s: ChatSummary) => void;
  onChanged: () => void;
  onClose: () => void;
};

/** Private Vault: chats hidden behind a PIN on this device, with an optional decoy PIN that opens an empty vault. */
export default function VaultPanel({ userId, summaries, onOpenChat, onChanged, onClose }: Props) {
  const [stage, setStage] = useState<"setup" | "locked" | "open">(vaultExists(userId) ? "locked" : "setup");
  const [decoyMode, setDecoyMode] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [decoy, setDecoy] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const hidden = hiddenChatIds(userId);
  void tick;
  const name = (s: ChatSummary) => s.peer?.name ?? s.chat.title ?? "Chat";
  const inVault = decoyMode ? [] : summaries.filter((s) => hidden.has(s.chat.id));
  const visible = summaries.filter((s) => !hidden.has(s.chat.id));

  const setup = async () => {
    const p = pinProblem(pin) ?? (pin !== pin2 ? "The two PINs don't match." : null) ?? (decoy && (pinProblem(decoy) ?? (decoy === pin ? "The decoy PIN must be different." : null)));
    if (p) return setError(p);
    await createVault(userId, pin, decoy || null);
    setError("");
    setPin("");
    setPin2("");
    setDecoy("");
    setDecoyMode(false);
    setStage("open");
  };

  const unlock = async () => {
    const r = await unlockVault(userId, pin);
    setPin("");
    if (r === "wrong") return setError("Wrong PIN.");
    setError("");
    setDecoyMode(r === "decoy");
    setStage("open");
  };

  const toggle = (chatId: string, hide: boolean) => {
    setChatHidden(userId, chatId, hide);
    setTick((t) => t + 1);
    onChanged();
  };

  return (
    <div className="vault-overlay" role="dialog" aria-label="Private Vault" onClick={onClose}>
      <div className="vault-card" onClick={(e) => e.stopPropagation()}>
        <div className="vault-head">
          <span className="vault-icon"><LockIcon size={20} /></span>
          <div>
            <h3>Private Vault</h3>
            <p>Hide chats behind a PIN on this device.</p>
          </div>
          <button type="button" className="vault-x" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        {stage === "setup" && (
          <form className="vault-form" onSubmit={(e) => { e.preventDefault(); void setup(); }}>
            <label>Choose a PIN (4-8 digits)<input inputMode="numeric" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Vault PIN" /></label>
            <label>Type it again<input inputMode="numeric" type="password" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} aria-label="Confirm vault PIN" /></label>
            <label>Decoy PIN (optional)<input inputMode="numeric" type="password" autoComplete="off" value={decoy} onChange={(e) => setDecoy(e.target.value)} aria-label="Decoy PIN" /><small>If someone forces you to open the vault, this PIN shows an empty vault.</small></label>
            {error && <p className="vault-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block">Create vault</button>
          </form>
        )}

        {stage === "locked" && (
          <form className="vault-form" onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
            <label>Enter your PIN<input inputMode="numeric" type="password" autoFocus autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Vault PIN" /></label>
            {error && <p className="vault-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block">Open vault</button>
          </form>
        )}

        {stage === "open" && (
          <div className="vault-body">
            <h4>Hidden chats ({inVault.length})</h4>
            {inVault.length === 0 ? (
              <p className="vault-muted">Your vault is empty.</p>
            ) : (
              <ul className="vault-list">
                {inVault.map((s) => (
                  <li key={s.chat.id}>
                    <button type="button" className="vault-open" onClick={() => { onOpenChat(s); onClose(); }}>{name(s)}</button>
                    <button type="button" className="home-link" onClick={() => toggle(s.chat.id, false)}>Show in list</button>
                  </li>
                ))}
              </ul>
            )}
            <h4>Hide a chat</h4>
            <ul className="vault-list">
              {visible.map((s) => (
                <li key={s.chat.id}>
                  <span>{name(s)}</span>
                  <button type="button" className="home-link" onClick={() => toggle(s.chat.id, true)}>Hide in vault</button>
                </li>
              ))}
              {visible.length === 0 && <li className="vault-muted">No other chats.</li>}
            </ul>
            <div className="vault-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setStage("locked"); setDecoyMode(false); }}>Lock</button>
              {!decoyMode && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("Remove the vault? Hidden chats go back to your chat list.")) { deleteVault(userId); onChanged(); setStage("setup"); } }}>Remove vault</button>
              )}
            </div>
            <p className="vault-muted small">Stored on this device only. Messages stay end-to-end encrypted as usual; the vault hides chats from view.</p>
          </div>
        )}
      </div>
    </div>
  );
}
