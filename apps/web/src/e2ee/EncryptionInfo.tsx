import { useEffect, useState } from "react";
import { e2ee } from "./e2ee";

/** Encryption status + WhatsApp-style safety code for a 1:1 chat. */
export default function EncryptionInfo({ chatId, peerId, peerName }: { chatId: string | null; peerId?: string; peerName?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const notice = chatId ? e2ee.keyChangeNotices.get(chatId) : undefined;

  useEffect(() => {
    setCode(null);
    setShow(false);
    setErr(null);
  }, [chatId, peerId]);

  const reveal = async () => {
    if (!chatId || !peerId) return;
    try {
      setCode(await e2ee.safetyCodeFor(chatId, peerId));
      setShow(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="e2ee-info">
      <span className="info-value">
        {e2ee.ready ? "🔒 End-to-end encrypted. Only the people in this chat can read new messages (not the server)." : "Encryption is starting on this device…"}
      </span>
      {notice && <span className="e2ee-notice">{notice}</span>}
      {peerId && e2ee.ready && (
        <>
          {!show ? (
            <button className="btn btn-secondary btn-xs" onClick={() => void reveal()}>Verify security code</button>
          ) : (
            <div className="e2ee-code" aria-label="Security code">
              <code>{code}</code>
              <span>Compare this code with {peerName ?? "the other person"}'s screen (in person or on a call). If they match, nobody is intercepting your messages.</span>
            </div>
          )}
          {err && <span className="e2ee-notice">{err}</span>}
        </>
      )}
      <span className="e2ee-limits">Photos and files are protected in transit and access-controlled on the server, but are not end-to-end encrypted yet.</span>
    </div>
  );
}
