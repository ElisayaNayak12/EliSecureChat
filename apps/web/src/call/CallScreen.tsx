import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import Avatar from "../components/Avatar";
import { LiveCaptioner, type AsrState } from "../ai/liveCaptions";
import { SignSession, type SignSessionState } from "../ai/signSession";
import { PersonalSignClassifier } from "../ai/signRecognizer";
import { listSamples, loadGestureMeanings, toTemplates } from "../ai/signStore";
import { GESTURE_INFO, type GestureName } from "../ai/gestures";
import type { LiveReading } from "../ai/signSession";
import { IslRecognizer, fetchPublishedModel } from "../ai/islModel";
import { speakText, stopSpeaking } from "../preferences";
import type { SignVideoLookup, UserPreferences } from "../types";
import { describeEndReason, type CallManager, type CallSnapshot, type TranslationEntry, type TranslationPayload } from "./CallManager";
import FingerspellPlayer, { type SpellItem } from "../components/FingerspellPlayer";
import { ALPHABETS, alphabetFor } from "../ai/fingerspell";

type Props = {
  manager: CallManager;
  snap: CallSnapshot;
  currentUserId: string;
  preferences: UserPreferences | null;
  resolveUrl: (url?: string) => string;
};

/** One recognised sign or gesture, before or after sending. */
type Detection = { label: string; meaning: string; confidence: number; engine: "mediapipe-gesture" | "personal-dtw" | "isl-model"; emoji?: string; correctionOf?: string };

const AUTO_SEND_MIN = 0.7;

/* ---------------- small pieces ---------------- */

function VideoTile({ stream, muted, mirrored, label, off, peerName, avatarUrl, resolveUrl, children, videoRef }: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  label: string;
  off?: boolean;
  peerName: string;
  avatarUrl?: string;
  resolveUrl: Props["resolveUrl"];
  children?: React.ReactNode;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const ownRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? ownRef;
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream, ref]);
  const hasVideo = !!stream?.getVideoTracks().length && !off;
  return (
    <div className="call-tile">
      <video ref={ref} autoPlay playsInline muted={muted} className={`call-tile-video ${mirrored ? "mirrored" : ""} ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo && (
        <div className="call-tile-placeholder">
          <Avatar name={peerName} avatarUrl={avatarUrl} size="xl" resolveUrl={resolveUrl} />
        </div>
      )}
      {children}
      <span className="call-tile-label">{label}</span>
    </div>
  );
}

function ConfidenceBadge({ p }: { p: TranslationPayload }) {
  if (p.source === "typed") return null;
  if (p.confidence === null) return <span className="tr-badge" title="This engine does not report confidence">confidence n/a</span>;
  const pct = Math.round(p.confidence * 100);
  return <span className={`tr-badge ${p.confidence < 0.6 ? "low" : "ok"}`}>{pct}%{p.confidence < 0.6 ? " · uncertain" : ""}</span>;
}

const SOURCE_LABEL: Record<TranslationPayload["source"], string> = { speech: "Speech → text", sign: "Sign → text", typed: "Typed" };

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Line icons for the call controls (premium design; emoji were replaced). */
const ICON_PATHS: Record<string, string> = {
  mic: "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 10a7 7 0 0 0 14 0M12 17v5M8 22h8",
  micOff: "M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M5 10a7 7 0 0 0 11.9 5M19 10a7 7 0 0 1-.6 2.8M12 17v5M8 22h8M3 3l18 18",
  cam: "M2 7.5A2.5 2.5 0 0 1 4.5 5h9A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 16.5zM16 10.5l6-3.5v10l-6-3.5",
  camOff: "M16 16.5V17a2 2 0 0 1-2 2H4.5A2.5 2.5 0 0 1 2 16.5v-9A2.5 2.5 0 0 1 4.5 5H6M10 5h3.5A2.5 2.5 0 0 1 16 7.5v3l6-3.5v10M3 3l18 18",
  switch: "M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4",
  hands: "M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.6 15a1.6 1.6 0 0 1 2.6-1.8L7 14.5",
  end: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
};
function CallIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/* ---------------- main ---------------- */

export default function CallScreen({ manager, snap, currentUserId, preferences, resolveUrl }: Props) {
  const signLanguage = preferences?.preferredSignLanguage ?? null;
  const spokenLang = preferences?.preferredLanguage ?? "en-IN";
  const [panelOpen, setPanelOpen] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Speech captions (this device's microphone -> Whisper on this device)
  const [captionsOn, setCaptionsOn] = useState(false);
  const [asrState, setAsrState] = useState<AsrState>("idle");
  const [asrDetail, setAsrDetail] = useState<string | undefined>();
  const captioner = useRef<LiveCaptioner | null>(null);

  // Sign recognition (this device's camera -> MediaPipe + personal recognizer on this device)
  const [signOn, setSignOn] = useState(false);
  const [signState, setSignState] = useState<SignSessionState>("idle");
  const [signDetail, setSignDetail] = useState<string | undefined>();
  const [signCount, setSignCount] = useState({ glosses: 0, samples: 0 });
  const [suggestion, setSuggestion] = useState<Detection | null>(null);
  const [editText, setEditText] = useState("");
  const [rejectNote, setRejectNote] = useState<string | null>(null);
  // Signers get automatic sending by default; results below the threshold still wait for confirmation.
  const [autoSend, setAutoSend] = useState(!!signLanguage);
  const [live, setLive] = useState<LiveReading | null>(null);
  const [detections, setDetections] = useState<(Detection & { id: string; status: "sent" | "pending" | "failed" })[]>([]);
  const autoStarted = useRef(false);
  const [gesturesOn, setGesturesOn] = useState(true);
  const [modelStatus, setModelStatus] = useState<string>("");
  const signSession = useRef<SignSession | null>(null);
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  const gesturesOnRef = useRef(true);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);

  // Incoming assistance
  const [speakIncoming, setSpeakIncoming] = useState(!signLanguage);
  const [signVideo, setSignVideo] = useState<{ text: string; result: SignVideoLookup | null; error?: string } | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const signVideoRef = useRef<HTMLVideoElement | null>(null);
  const [typed, setTyped] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const handledIds = useRef(new Set<string>());

  const active = snap.phase === "active";
  const isVideo = snap.media === "VIDEO";

  // Fingerspelling: the alphabet this user reads, and the one the other person reads (shared when the call connects).
  const myAlphabet = alphabetFor(signLanguage);
  const peerSignLanguage = snap.peerProfile?.signLanguage ?? null;
  const peerAlphabet = alphabetFor(peerSignLanguage);
  const profileSent = useRef<string | null>(null);
  const captionsAuto = useRef(false);
  const [fixing, setFixing] = useState(false);
  const [fixText, setFixText] = useState("");

  useEffect(() => {
    if (!active || !snap.callId || profileSent.current === snap.callId) return;
    profileSent.current = snap.callId;
    void manager.sendProfile({ signLanguage });
  }, [active, snap.callId, signLanguage, manager]);

  // A hearing person talking to a signer: start captions automatically so their speech can be shown as signs.
  useEffect(() => {
    if (active && peerSignLanguage && !signLanguage && !captionsAuto.current) {
      captionsAuto.current = true;
      setCaptionsOn(true);
    }
  }, [active, peerSignLanguage, signLanguage]);

  const spokenTo = (from: "me" | "peer"): SpellItem[] =>
    snap.translations.filter((t) => t.from === from && t.payload.source !== "sign").map((t) => ({ id: t.id, text: t.payload.text }));
  const incomingToSpell = useMemo(() => spokenTo("peer"), [snap.translations]); // eslint-disable-line react-hooks/exhaustive-deps
  const outgoingPreview = useMemo(() => spokenTo("me"), [snap.translations]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSpoken = [...snap.translations].reverse().find((t) => t.from === "me" && t.payload.source !== "sign");

  const resendFixed = () => {
    const text = fixText.trim();
    if (!text) return;
    void send({ source: "typed", text, final: true, confidence: null, language: spokenLang, engine: "correction", corrected: true });
    setFixing(false);
  };

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);

  const send = useCallback(
    async (payload: TranslationPayload) => {
      setSendError(null);
      try {
        await manager.sendTranslation(payload);
      } catch (err) {
        setSendError((err as Error).message);
      }
    },
    [manager],
  );

  /* ---- speech captions ---- */
  useEffect(() => {
    if (!captionsOn || !active || !snap.localStream) return;
    const c = new LiveCaptioner(
      (cap) => {
        const payload: TranslationPayload = { source: "speech", text: cap.text, final: cap.final, confidence: null, language: spokenLang, engine: c.engine };
        if (cap.final) void send(payload);
        else void manager.sendTranslation(payload).catch(() => undefined); // interim: best effort
      },
      (s, d) => {
        setAsrState(s);
        setAsrDetail(d);
      },
    );
    captioner.current = c;
    c.start(snap.localStream).catch((err: Error) => {
      setAsrState("error");
      setAsrDetail(err.message);
    });
    return () => {
      c.stop();
      captioner.current = null;
    };
  }, [captionsOn, active, snap.localStream, spokenLang, manager, send]);

  useEffect(() => {
    if (active && signLanguage && isVideo && snap.camOn && !autoStarted.current) {
      autoStarted.current = true;
      setSignOn(true);
    }
  }, [active, signLanguage, isVideo, snap.camOn]);

  const deliverDetection = useCallback(
    async (d: Detection, forceSend = false) => {
      const id = crypto.randomUUID();
      const confident = d.confidence >= AUTO_SEND_MIN;
      if (!forceSend && !(autoSendRef.current && confident)) {
        setDetections((prev) => [{ ...d, id, status: "pending" as const }, ...prev].slice(0, 6));
        setSuggestion(d);
        setEditText(d.meaning);
        return;
      }
      setDetections((prev) => [{ ...d, id, status: "sent" as const }, ...prev].slice(0, 6));
      try {
        await manager.sendTranslation({
          source: "sign", text: d.meaning, final: true, confidence: d.confidence, gloss: [d.label],
          language: spokenLang, engine: d.engine, corrected: !!d.correctionOf,
        });
      } catch (err) {
        setSendError((err as Error).message);
        setDetections((prev) => prev.map((x) => (x.id === id ? { ...x, status: "failed" as const } : x)));
      }
    },
    [manager, spokenLang],
  );

  /* ---- sign recognition ---- */
  useEffect(() => {
    if (!signOn || !active || !localVideo.current) return;
    let cancelled = false;
    let session: SignSession | null = null;
    (async () => {
      const samples = await listSamples(currentUserId, signLanguage ?? "isl");
      if (cancelled) return;
      const classifier = new PersonalSignClassifier(toTemplates(samples));
      const meanings = loadGestureMeanings(currentUserId);
      // Trained sign-language model for the user's sign language (published by an admin), if any.
      let model: IslRecognizer | null = null;
      if (signLanguage) {
        try {
          const published = await fetchPublishedModel(signLanguage);
          if (published) {
            setModelStatus(`Loading ${signLanguage.toUpperCase()} model v${published.manifest.version}…`);
            model = await IslRecognizer.load(published);
            const acc = published.manifest.metrics.testAccuracy;
            setModelStatus(
              `${signLanguage.toUpperCase()} model v${published.manifest.version}: ${published.manifest.labels.length} signs` +
                (acc !== null ? `, ${Math.round(acc * 100)}% test accuracy${published.manifest.metrics.signerIndependent ? "" : " (not signer-independent)"}` : ""),
            );
          } else setModelStatus(`No trained ${signLanguage.toUpperCase()} model published yet`);
        } catch (err) {
          setModelStatus(`Sign model unavailable: ${(err as Error).message}`);
        }
      }
      if (cancelled) {
        model?.release();
        return;
      }
      setSignCount({ glosses: classifier.glossCount, samples: classifier.sampleCount });
      session = new SignSession(localVideo.current!, overlay.current, {
        onState: (s, d) => {
          setSignState(s);
          setSignDetail(d);
          if (s !== "running") setLive(null);
        },
        onLive: setLive,
        onGesture: (g) => {
          const meaning = meanings[g.gesture];
          if (!meaning) return; // user disabled this gesture
          setRejectNote(null);
          const info = GESTURE_INFO[g.gesture as GestureName];
          void deliverDetection({ label: info.label, emoji: info.emoji, meaning, confidence: g.score, engine: "mediapipe-gesture" });
        },
        onModelRecognition: (r) => {
          if (r.accepted) {
            setRejectNote(null);
            void deliverDetection({ label: r.gloss, meaning: r.meaning, confidence: r.confidence, engine: "isl-model" });
          } else if (r.reason === "LOW_CONFIDENCE") {
            setRejectNote(`Unsure (maybe ${r.bestGloss}, ${Math.round(r.confidence * 100)}%). Nothing was sent.`);
          }
        },
        onRecognition: (r) => {
          if (r.accepted) {
            setRejectNote(null);
            void deliverDetection({ label: r.gloss, meaning: r.meaning, confidence: r.confidence, engine: "personal-dtw" });
          } else if (r.reason === "NO_TEMPLATES") {
            // Built-in gestures still work without personal signs; stay quiet about it.
          } else if (r.reason !== "TOO_SHORT") {
            setRejectNote(
              r.reason === "AMBIGUOUS"
                  ? `Unsure: could be ${r.bestGloss}. Not sent.`
                  : "Sign not recognised. Nothing was sent.",
            );
          }
        },
      }, classifier, true);
      session.model = model;
      session.gesturesEnabled = gesturesOnRef.current;
      signSession.current = session;
      await session.start().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      session?.stop();
      session?.model?.release();
      signSession.current = null;
    };
  }, [signOn, active, currentUserId, signLanguage, deliverDetection]);

  useEffect(() => {
    gesturesOnRef.current = gesturesOn;
    if (signSession.current) signSession.current.gesturesEnabled = gesturesOn;
  }, [gesturesOn]);

  /* ---- incoming: speak sign/typed translations, show human signing video for speech/typed ---- */
  useEffect(() => {
    const latest = snap.translations.filter((t) => t.from === "peer" && !handledIds.current.has(t.id));
    for (const t of latest) {
      handledIds.current.add(t.id);
      if (speakIncoming && t.payload.source !== "speech") {
        speakText(t.payload.text, preferences?.voice.voiceName ?? null, preferences?.voice.speakingRate ?? 1, spokenLang);
      }
      if (signLanguage && t.payload.source !== "sign") {
        const text = t.payload.text;
        setSignVideo({ text, result: null });
        api
          .lookupSignVideo(signLanguage, text)
          .then((result) => setSignVideo({ text, result }))
          .catch((err: Error) => setSignVideo({ text, result: null, error: err.message }));
      }
    }
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [snap.translations, speakIncoming, signLanguage, spokenLang, preferences?.voice.voiceName, preferences?.voice.speakingRate]);

  useEffect(() => {
    if (signVideoRef.current) signVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate, signVideo]);

  useEffect(() => () => stopSpeaking(), []);

  // Ended calls clear themselves after a moment.
  useEffect(() => {
    if (snap.phase !== "ended") return;
    const t = window.setTimeout(() => manager.dismiss(), 3500);
    return () => window.clearTimeout(t);
  }, [snap.phase, manager]);

  const sendSuggestion = () => {
    if (!suggestion) return;
    const text = editText.trim();
    if (!text) return;
    const corrected = text !== suggestion.meaning || !!suggestion.correctionOf;
    void deliverDetection({ ...suggestion, meaning: text, correctionOf: corrected ? suggestion.meaning : undefined }, true);
    setDetections((prev) => prev.filter((x) => x.status !== "pending"));
    setSuggestion(null);
  };

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    void send({ source: "typed", text, final: true, confidence: null, language: spokenLang, engine: "keyboard" });
    setTyped("");
  };

  const statusText = useMemo(() => {
    switch (snap.phase) {
      case "outgoing": return snap.callId ? "Ringing…" : "Calling…";
      case "incoming": return `Incoming ${isVideo ? "video" : "audio"} call`;
      case "connecting": return "Connecting…";
      case "active": return snap.connectedAt ? formatDuration(Math.max(0, now - snap.connectedAt)) : "Connected";
      case "ended": return describeEndReason(snap.endReason);
    }
  }, [snap.phase, snap.callId, snap.connectedAt, snap.endReason, isVideo, now]);

  /* ---------------- incoming / ended cards ---------------- */
  if (snap.phase === "incoming" || snap.phase === "ended" || (snap.phase === "outgoing" && !snap.localStream)) {
    return (
      <div className="call-ring-overlay" role="dialog" aria-modal="true" aria-label={statusText}>
        <div className="call-ring-card">
          <div className={`call-ring-avatar ${snap.phase !== "ended" ? "pulsing" : ""}`}>
            <Avatar name={snap.peer.name} avatarUrl={snap.peer.avatarUrl} size="xl" resolveUrl={resolveUrl} />
          </div>
          <h2>{snap.peer.name}</h2>
          <p className="call-ring-status">{statusText}</p>
          {snap.error && <p className="call-ring-error">{snap.error}</p>}
          {snap.phase === "incoming" && (
            <div className="call-ring-actions">
              <button className="call-round-btn decline" onClick={() => void manager.decline()} aria-label="Decline">✕</button>
              {isVideo && <button className="call-round-btn secondary" onClick={() => void manager.accept(true)} aria-label="Accept with audio only">🎙</button>}
              <button className="call-round-btn accept" onClick={() => void manager.accept()} aria-label={`Accept ${isVideo ? "video" : "audio"} call`}>✓</button>
            </div>
          )}
          {snap.phase === "ended" && <button className="btn btn-secondary btn-sm" onClick={() => manager.dismiss()}>Close</button>}
          {snap.phase === "outgoing" && <button className="call-round-btn decline" onClick={() => void manager.hangup()} aria-label="Cancel call">✕</button>}
        </div>
      </div>
    );
  }

  /* ---------------- in-call ---------------- */
  const renderEntry = (t: TranslationEntry) => (
    <div key={t.id} className={`tr-entry ${t.from}`}>
      <div className="tr-meta">
        <strong>{t.from === "me" ? "You" : snap.peer.name}</strong>
        <span>{SOURCE_LABEL[t.payload.source]}</span>
        <ConfidenceBadge p={t.payload} />
        {t.payload.corrected && <span className="tr-badge">corrected</span>}
      </div>
      <p className="tr-text">{t.payload.text}</p>
      {t.payload.gloss && <p className="tr-gloss">Gloss: {t.payload.gloss.join(" ")} · {t.payload.engine}</p>}
    </div>
  );

  return (
    <div className={`call-screen premium ${panelOpen ? "with-panel" : ""}`} data-phase={snap.phase}>
      <header className="call-topbar">
        <div className="call-peer">
          <Avatar name={snap.peer.name} avatarUrl={snap.peer.avatarUrl} size="sm" resolveUrl={resolveUrl} />
          <div>
            <strong>{snap.peer.name}</strong>
            <span>{statusText}</span>
          </div>
        </div>
        <span className={`call-quality q-${snap.quality.level}`} title={snap.quality.rttMs !== undefined ? `RTT ${snap.quality.rttMs} ms · loss ${snap.quality.lossPct}%` : "Measuring…"}>
          <i /><i /><i /> {snap.quality.level === "unknown" ? "Network" : snap.quality.level}
        </span>
      </header>

      <div className="call-body">
        <section className="call-stage" aria-label="Video">
          <VideoTile stream={snap.remoteStream} label={snap.peer.name} peerName={snap.peer.name} avatarUrl={snap.peer.avatarUrl} resolveUrl={resolveUrl} off={!isVideo} />
          <VideoTile stream={snap.localStream} muted mirrored label={`You${snap.micOn ? "" : " · muted"}`} peerName="You" resolveUrl={resolveUrl} off={!snap.camOn || !isVideo} videoRef={localVideo}>
            <canvas ref={overlay} className={`call-hand-overlay ${signOn ? "" : "hidden"}`} aria-hidden="true" />
            {signOn && (
              <span className={`call-detect-badge ${live?.gesture ? "hit" : ""}`} aria-live="off">
                {signState === "loading"
                  ? `Loading vision model ${signDetail ?? ""}`
                  : !live
                    ? "Sign detection starting…"
                    : live.gesture && GESTURE_INFO[live.gesture.name as GestureName]
                      ? `${GESTURE_INFO[live.gesture.name as GestureName].emoji} ${GESTURE_INFO[live.gesture.name as GestureName].label} ${Math.round(live.gesture.score * 100)}%`
                      : live.hands
                        ? `${live.hands} hand${live.hands > 1 ? "s" : ""} detected`
                        : "No hands in view"}
              </span>
            )}
          </VideoTile>
          {(snap.interim.peer || snap.translations.some((t) => t.from === "peer")) && (
            <div className="call-live-caption" aria-live="polite">
              {(() => {
                const last = snap.interim.peer ?? [...snap.translations].reverse().find((t) => t.from === "peer")?.payload;
                return (
                  <>
                    <span>{snap.peer.name}{last?.source === "sign" ? " (signing)" : ""}:</span> {last?.text}
                  </>
                );
              })()}
            </div>
          )}
        </section>

        {panelOpen && (
          <aside className="call-panel" aria-label="Translation">
            <div className="call-panel-pinned">
              {myAlphabet && (
                <section className="cp-sign-stage" aria-label="Speech to sign">
                  <FingerspellPlayer
                    items={incomingToSpell}
                    alphabet={myAlphabet}
                    title={`${snap.peer.name} said`}
                    emptyText={`When ${snap.peer.name} speaks or types, the words appear here as ${ALPHABETS[myAlphabet].short} fingerspelling with real hand photos.`}
                  />
                </section>
              )}
              {signLanguage && !myAlphabet && (
                <p className="cp-note">Fingerspelling photos are not available for {signLanguage.toUpperCase()} yet. Captions and verified sign videos still work.</p>
              )}

              {peerAlphabet && (
                <section className="cp-preview" aria-label={`What ${snap.peer.name} sees`}>
                  <FingerspellPlayer
                    compact
                    items={outgoingPreview}
                    alphabet={peerAlphabet}
                    title={`What ${snap.peer.name} sees`}
                    emptyText={captionsOn ? `Speak: your words are shown to ${snap.peer.name} as ${ALPHABETS[peerAlphabet].short} fingerspelling.` : "Turn on speech captions so your words can be shown as signs."}
                  />
                  {lastSpoken && !fixing && (
                    <div className="cp-heard">
                      <span>Heard: “{lastSpoken.payload.text}”</span>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setFixText(lastSpoken.payload.text); setFixing(true); }}>Fix</button>
                    </div>
                  )}
                  {fixing && (
                    <form className="cp-fix" onSubmit={(e) => { e.preventDefault(); resendFixed(); }}>
                      <input value={fixText} onChange={(e) => setFixText(e.target.value)} aria-label="Corrected caption" maxLength={500} autoFocus />
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFixing(false)}>Cancel</button>
                      <button className="btn btn-primary btn-xs" disabled={!fixText.trim()}>Resend</button>
                    </form>
                  )}
                </section>
              )}
              {peerSignLanguage && !peerAlphabet && (
                <p className="cp-note">{snap.peer.name} reads {peerSignLanguage.toUpperCase()}; fingerspelling photos for it are not available yet, so they see your captions as text.</p>
              )}

            </div>
            <div className="call-panel-scroll">
              <div className="cp-section">
                <h3>Translation</h3>
                <p className="cp-note">All recognition runs on this device. Only the resulting text is sent to {snap.peer.name}.</p>

                <div className="cp-toggle-row">
                  <div>
                    <strong>Speech captions</strong>
                    <span>{asrState === "idle" ? "Whisper tiny (English), offline" : asrState === "loading" ? `Loading model ${asrDetail ?? ""}` : asrState === "error" ? `Error: ${asrDetail}` : asrState === "transcribing" ? "Transcribing…" : "Listening"}</span>
                  </div>
                  <button role="switch" aria-checked={captionsOn} className={`pref-switch ${captionsOn ? "on" : ""}`} disabled={!active} onClick={() => setCaptionsOn((v) => !v)} aria-label="Speech captions"><span className="pref-switch-thumb" /></button>
                </div>

                <div className="cp-toggle-row">
                  <div>
                    <strong>Sign &amp; gesture detection</strong>
                    <span>
                      {signState === "idle"
                        ? "Built-in gestures 👍 👎 ✋ ✊ ☝️ ✌️ 🤟 + your recorded signs"
                        : signState === "loading"
                          ? `Loading vision model ${signDetail ?? ""}`
                          : signState === "error"
                            ? `Error: ${signDetail}`
                            : `Running on this device (${signDetail}${live ? `, ${live.fps} fps` : ""})${gesturesOn ? " · 7 gestures" : ""} + ${signCount.glosses} personal signs`}
                    </span>
                  </div>
                  <button role="switch" aria-checked={signOn} className={`pref-switch ${signOn ? "on" : ""}`} disabled={!active || !isVideo || !snap.camOn} onClick={() => setSignOn((v) => !v)} aria-label="Sign and gesture detection"><span className="pref-switch-thumb" /></button>
                </div>
                {signOn && modelStatus && <p className="cp-note cp-model-status">{modelStatus}</p>}
                {signOn && (
                  <label className="cp-check">
                    <input type="checkbox" checked={gesturesOn} onChange={(e) => setGesturesOn(e.target.checked)} /> Also use built-in gestures (👍 👎 ✋ ✊ ☝️ ✌️ 🤟)
                  </label>
                )}
                {signOn && (
                  <label className="cp-check">
                    <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> Send confident results (≥{Math.round(AUTO_SEND_MIN * 100)}%) automatically as text + speech
                  </label>
                )}

                <div className="cp-toggle-row">
                  <div>
                    <strong>Read incoming signs aloud</strong>
                    <span>Uses an on-device voice</span>
                  </div>
                  <button role="switch" aria-checked={speakIncoming} className={`pref-switch ${speakIncoming ? "on" : ""}`} onClick={() => { setSpeakIncoming((v) => !v); stopSpeaking(); }} aria-label="Read incoming signs aloud"><span className="pref-switch-thumb" /></button>
                </div>
              </div>

              {suggestion && (
                <div className="cp-suggestion" role="status">
                  <span className="cp-eyebrow">
                    {suggestion.correctionOf ? "Correct what was sent" : `${suggestion.engine === "mediapipe-gesture" ? "Gesture" : suggestion.engine === "isl-model" ? "Sign model" : "Personal sign"} · ${Math.round(suggestion.confidence * 100)}%${suggestion.confidence < 0.6 ? " · uncertain" : ""}`}
                  </span>
                  <strong>{suggestion.emoji ? `${suggestion.emoji} ` : ""}{suggestion.label}</strong>
                  <input value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="English text to send" />
                  <div className="cp-suggestion-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setSuggestion(null)}>Discard</button>
                    <button className="btn btn-primary btn-sm" onClick={sendSuggestion}>Send</button>
                  </div>
                </div>
              )}
              {rejectNote && !suggestion && <p className="cp-reject">{rejectNote}</p>}

              {signOn && detections.length > 0 && (
                <div className="cp-section">
                  <h3>Detected</h3>
                  <ul className="cp-detections">
                    {detections.map((d) => (
                      <li key={d.id} className={`cp-detection ${d.status}`}>
                        <span className="cp-det-sign">{d.emoji ?? "🤲"} {d.label}</span>
                        <span className="cp-det-text">“{d.meaning}”</span>
                        <span className="tr-badge">{Math.round(d.confidence * 100)}%</span>
                        <span className="cp-det-status">{d.status === "sent" ? "sent" : d.status === "failed" ? "not delivered" : "confirm below"}</span>
                        {d.status === "sent" && (
                          <button className="btn btn-ghost btn-xs" onClick={() => { setSuggestion({ ...d, correctionOf: d.meaning }); setEditText(d.meaning); }}>Correct</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {signLanguage && (
                <div className="cp-section">
                  <h3>Signing video ({signLanguage.toUpperCase()})</h3>
                  {!signVideo && <p className="cp-note">When {snap.peer.name} speaks or types, a verified human signing video is shown here if one exists for that exact sentence.</p>}
                  {signVideo && !signVideo.result && !signVideo.error && <p className="cp-note">Looking up “{signVideo.text}”…</p>}
                  {signVideo?.error && <p className="cp-reject">Lookup failed: {signVideo.error}</p>}
                  {signVideo?.result?.match && (
                    <div className="cp-signvideo">
                      <video ref={signVideoRef} src={resolveUrl(signVideo.result.match.url)} autoPlay playsInline muted controls={false} onLoadedMetadata={(e) => (e.currentTarget.playbackRate = playbackRate)} />
                      <p className="tr-gloss">“{signVideo.result.match.phraseText}” · signer {signVideo.result.match.signerId} · verified</p>
                      <div className="cp-signvideo-controls">
                        <button className="btn btn-secondary btn-sm" onClick={() => { const v = signVideoRef.current; if (v) { v.currentTime = 0; void v.play(); } }}>Replay</button>
                        {[0.5, 0.75, 1, 1.25].map((r) => (
                          <button key={r} className={`btn btn-sm ${playbackRate === r ? "btn-primary" : "btn-secondary"}`} onClick={() => setPlaybackRate(r)}>{r}×</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {signVideo?.result && !signVideo.result.match && (
                    <p className="cp-fallback">
                      No verified {signLanguage.toUpperCase()} video for “{signVideo.text}”.
                      {signVideo.result.reason === "LANGUAGE_HAS_NO_VERIFIED_VIDEOS" ? " The library has no verified videos for this language yet." : " Showing text only."}
                    </p>
                  )}
                </div>
              )}

              <div className="cp-section">
                <h3>Transcript</h3>
                <div className="cp-transcript">
                  {snap.translations.length === 0 && !snap.interim.me && !snap.interim.peer && <p className="cp-note">Captions and translations will appear here.</p>}
                  {snap.translations.map(renderEntry)}
                  {snap.interim.peer && <div className="tr-entry peer interim"><p className="tr-text">{snap.interim.peer.text}…</p></div>}
                  <div ref={transcriptEnd} />
                </div>
              </div>
            </div>

            {sendError && <p className="cp-reject">Not delivered: {sendError}</p>}
            <form className="cp-type" onSubmit={(e) => { e.preventDefault(); sendTyped(); }}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a message to show as a caption" disabled={!active} aria-label="Type a caption" maxLength={500} />
              <button className="btn btn-primary btn-sm" disabled={!active || !typed.trim()}>Send</button>
            </form>
          </aside>
        )}
      </div>

      <footer className="call-controls">
        <div className="call-controls-inner">
          <button className={`call-ctl ${snap.micOn ? "" : "off"}`} onClick={() => manager.toggleMic()} aria-pressed={!snap.micOn} aria-label={snap.micOn ? "Mute microphone" : "Unmute microphone"}>
            <CallIcon name={snap.micOn ? "mic" : "micOff"} /><span>{snap.micOn ? "Mute" : "Unmute"}</span>
          </button>
          {isVideo && (
            <button className={`call-ctl ${snap.camOn ? "" : "off"}`} onClick={() => manager.toggleCamera()} aria-pressed={!snap.camOn} aria-label={snap.camOn ? "Turn camera off" : "Turn camera on"}>
              <CallIcon name={snap.camOn ? "cam" : "camOff"} /><span>{snap.camOn ? "Camera" : "Camera off"}</span>
            </button>
          )}
          {snap.canSwitchCamera && (
            <button className="call-ctl" onClick={() => void manager.switchCamera()} aria-label="Switch camera"><CallIcon name="switch" /><span>Switch</span></button>
          )}
          <button className={`call-ctl ${panelOpen ? "lit" : ""}`} onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen} aria-label="Translation panel">
            <CallIcon name="hands" /><span>Signs</span>
          </button>
          <button className="call-ctl end" onClick={() => void manager.hangup()} aria-label="End call"><CallIcon name="end" /><span>End</span></button>
        </div>
      </footer>
    </div>
  );
}
