import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { LiveCaptioner, type AsrState, preloadAsr } from "../ai/liveCaptions";
import { ASR_MODEL, HAND_MODEL, formatBytes, isAsrModelInstalled, isHandModelInstalled, removeAsrModel, removeHandModel } from "../ai/models";
import { getHandTracker } from "../ai/handTracker";
import { SignSession, type SignSessionState } from "../ai/signSession";
import { MIN_SAMPLES_PER_SIGN, PersonalSignClassifier, type Recognition } from "../ai/signRecognizer";
import { addSample, deleteGloss, listSamples, loadGestureMeanings, saveGestureMeanings, toTemplates, type StoredSample } from "../ai/signStore";
import { GESTURES, GESTURE_INFO, defaultMeanings, type GestureMeanings, type GestureName } from "../ai/gestures";
import type { LiveReading } from "../ai/signSession";
import { handsToRaw, type RawHand } from "../ai/signFeatures";
import { IslRecognizer, fetchPublishedModel, isModelCached, removeCachedModel, type PublishedModel } from "../ai/islModel";
import DatasetContribution, { type CapturedSign } from "./DatasetContribution";
import type { SignLanguagePack, SignVideo, User, UserPreferences } from "../types";

type Props = {
  currentUser: User;
  preferences: UserPreferences | null;
  resolveUrl: (url?: string) => string;
};

type ModelRow = { installed: boolean | null; busy: boolean; progress: number; error?: string };

const CAPTURE_MAX_MS = 4000;

export default function TranslatorPanel({ currentUser, preferences, resolveUrl }: Props) {
  const [packs, setPacks] = useState<SignLanguagePack[]>([]);
  const [language, setLanguage] = useState(preferences?.preferredSignLanguage ?? "isl");

  /* ---------------- models ---------------- */
  const [hand, setHand] = useState<ModelRow>({ installed: null, busy: false, progress: 0 });
  const [asr, setAsr] = useState<ModelRow>({ installed: null, busy: false, progress: 0 });

  const refreshModels = async () => {
    setHand((h) => ({ ...h, installed: null }));
    const [h, a] = await Promise.all([isHandModelInstalled(), isAsrModelInstalled()]);
    setHand((s) => ({ ...s, installed: h }));
    setAsr((s) => ({ ...s, installed: a }));
  };

  useEffect(() => {
    void refreshModels();
    api.listSignLanguages().then(setPacks).catch(() => setPacks([]));
  }, []);

  const installHand = async () => {
    setHand({ installed: false, busy: true, progress: 0 });
    try {
      await getHandTracker((f) => setHand((s) => ({ ...s, progress: f })));
      setHand({ installed: true, busy: false, progress: 1 });
    } catch (err) {
      setHand({ installed: false, busy: false, progress: 0, error: (err as Error).message });
    }
  };

  const installAsr = async () => {
    setAsr({ installed: false, busy: true, progress: 0 });
    try {
      await preloadAsr((f) => setAsr((s) => ({ ...s, progress: f })));
      setAsr({ installed: true, busy: false, progress: 1 });
    } catch (err) {
      setAsr({ installed: false, busy: false, progress: 0, error: (err as Error).message });
    }
  };

  /* ---------------- camera + personal signs ---------------- */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<SignSession | null>(null);
  const [trackState, setTrackState] = useState<SignSessionState>("idle");
  const [trackDetail, setTrackDetail] = useState<string | undefined>();
  const [handsNow, setHandsNow] = useState(0);

  const [samples, setSamples] = useState<StoredSample[]>([]);
  const [gloss, setGloss] = useState("");
  const [meaning, setMeaning] = useState("");
  const [capture, setCapture] = useState<{ phase: "idle" | "countdown" | "recording"; count: number }>({ phase: "idle", count: 0 });
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const captureFrames = useRef<Float32Array[] | null>(null);
  const captureRaw = useRef<{ t: number; hands: RawHand[] }[] | null>(null);
  const captureStart = useRef(0);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<(Recognition & { at: number })[]>([]);
  const [gestureHits, setGestureHits] = useState<{ at: number; gesture: GestureName; score: number }[]>([]);
  const [live, setLive] = useState<LiveReading | null>(null);
  const [meanings, setMeanings] = useState<GestureMeanings>(() => loadGestureMeanings(currentUser.id));
  const [meaningsSaved, setMeaningsSaved] = useState<string | null>(null);

  const classifier = useMemo(() => new PersonalSignClassifier(toTemplates(samples)), [samples]);
  const glossSummary = useMemo(() => {
    const m = new Map<string, { meaning: string; count: number }>();
    for (const s of samples) m.set(s.gloss, { meaning: s.meaning, count: (m.get(s.gloss)?.count ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [samples]);

  const reloadSamples = async () => setSamples(await listSamples(currentUser.id, language));
  useEffect(() => {
    void reloadSamples();
  }, [language, currentUser.id]);

  useEffect(() => {
    if (sessionRef.current) sessionRef.current.classifier = classifier;
  }, [classifier]);

  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamOn(true);
      const session = new SignSession(videoRef.current!, overlayRef.current, {
        onState: (s, d) => {
          setTrackState(s);
          setTrackDetail(d);
          if (s === "running") setHand((h) => ({ ...h, installed: true }));
        },
        onFrame: (f, n, hands) => {
          setHandsNow(n);
          if (captureFrames.current) captureFrames.current.push(f);
          if (captureRaw.current) captureRaw.current.push({ t: Math.round(performance.now() - captureStart.current), hands: handsToRaw(hands) });
        },
        onRecognition: (r) => setResults((prev) => [{ ...r, at: Date.now() }, ...prev].slice(0, 6)),
        onGesture: (g) => setGestureHits((prev) => [{ at: Date.now(), gesture: g.gesture, score: g.score }, ...prev].slice(0, 6)),
        onLive: setLive,
      }, classifier, true);
      session.recognize = false;
      sessionRef.current = session;
      await session.start();
    } catch (err) {
      setCamError((err as Error).name === "NotAllowedError" ? "Camera permission was denied." : (err as Error).message);
      stopCamera();
    }
  };

  const stopCamera = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setTesting(false);
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (sessionRef.current) sessionRef.current.recognize = testing && capture.phase === "idle";
  }, [testing, capture.phase]);

  /** Countdown, then capture one sign: stops when hands are lowered for 0.5 s, or after CAPTURE_MAX_MS. */
  const captureOnce = async (): Promise<{ features: Float32Array[]; raw: { t: number; hands: RawHand[] }[] } | null> => {
    for (let c = 3; c > 0; c--) {
      setCapture({ phase: "countdown", count: c });
      await new Promise((r) => setTimeout(r, 700));
    }
    setCapture({ phase: "recording", count: 0 });
    captureStart.current = performance.now();
    captureFrames.current = [];
    captureRaw.current = [];
    const started = Date.now();
    let sawHands = false;
    let lastHands = Date.now();
    while (Date.now() - started < CAPTURE_MAX_MS) {
      await new Promise((r) => setTimeout(r, 100));
      const frames = captureFrames.current;
      const last = frames[frames.length - 1];
      const present = !!last && (last[0] > 0 || last[66] > 0);
      if (present) {
        sawHands = true;
        lastHands = Date.now();
      } else if (sawHands && Date.now() - lastHands > 500) break;
    }
    const features = captureFrames.current ?? [];
    const raw = captureRaw.current ?? [];
    captureFrames.current = null;
    captureRaw.current = null;
    setCapture({ phase: "idle", count: 0 });
    // Trim frames without hands at both ends (the same rule for both outputs, so they stay aligned).
    const has = (f: Float32Array) => f[0] > 0 || f[66] > 0;
    const first = features.findIndex(has);
    if (first < 0) return { features: [], raw: [] };
    const lastIdx = features.length - 1 - [...features].reverse().findIndex(has);
    return { features: features.slice(first, lastIdx + 1), raw: raw.slice(first, lastIdx + 1) };
  };

  const recordSample = async () => {
    const g = gloss.trim().toUpperCase();
    const m = meaning.trim();
    if (!g || !m) {
      setCaptureMsg("Enter the sign's gloss and its English meaning first.");
      return;
    }
    setCaptureMsg(null);
    const got = await captureOnce();
    const trimmed = got?.features ?? [];
    if (trimmed.filter((f) => f[0] > 0 || f[66] > 0).length < 8) {
      setCaptureMsg("No clear hands were seen. Make sure your hands are in frame and well lit, then try again.");
      return;
    }
    await addSample({ userId: currentUser.id, language, gloss: g, meaning: m, frames: trimmed });
    await reloadSamples();
    setCaptureMsg(`Saved a sample of ${g} (${trimmed.length} frames). Only landmarks were stored, on this device.`);
  };

  const captureForDataset = async (): Promise<CapturedSign | null> => {
    const got = await captureOnce();
    if (!got) return null;
    const frames = got.raw.slice(0, 150);
    return { frames, handFrames: frames.filter((f) => f.hands.length > 0).length };
  };

  /* ---------------- trained sign model ---------------- */
  const [published, setPublished] = useState<PublishedModel | null | undefined>(undefined);
  const [pubCached, setPubCached] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const refreshPublished = async () => {
    try {
      const m = await fetchPublishedModel(language);
      setPublished(m);
      setPubCached(m ? await isModelCached(m) : false);
    } catch (err) {
      setPublished(null);
      setPubError((err as Error).message);
    }
  };
  useEffect(() => {
    void refreshPublished();
  }, [language]);
  const installPublished = async () => {
    if (!published) return;
    setPubBusy(true);
    setPubError(null);
    try {
      const rec = await IslRecognizer.load(published);
      rec.release();
      setPubCached(true);
    } catch (err) {
      setPubError((err as Error).message);
    } finally {
      setPubBusy(false);
    }
  };

  /* ---------------- caption test ---------------- */
  const [capOn, setCapOn] = useState(false);
  const [capState, setCapState] = useState<AsrState>("idle");
  const [capDetail, setCapDetail] = useState<string | undefined>();
  const [captions, setCaptions] = useState<{ text: string; final: boolean; latencyMs: number }[]>([]);
  useEffect(() => {
    if (!capOn) return;
    let stream: MediaStream | null = null;
    const c = new LiveCaptioner(
      (cap) => setCaptions((prev) => [...prev.filter((p) => p.final), cap].slice(-8)),
      (s, d) => {
        setCapState(s);
        setCapDetail(d);
        if (s === "listening") setAsr((a) => ({ ...a, installed: true }));
      },
    );
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        stream = s;
        return c.start(s);
      })
      .catch((err: Error) => {
        setCapState("error");
        setCapDetail(err.name === "NotAllowedError" ? "Microphone permission was denied." : err.message);
      });
    return () => {
      c.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [capOn]);

  /* ---------------- sign-video contribution ---------------- */
  const [myVideos, setMyVideos] = useState<SignVideo[]>([]);
  const [vf, setVf] = useState({ unit: "SENTENCE", phraseText: "", gloss: "", meaning: "", signerId: "", region: "", quality: "MEDIUM", license: "", provenance: "" });
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reloadVideos = () => api.listMySignVideos(currentUser.id).then(setMyVideos).catch(() => undefined);
  useEffect(() => {
    void reloadVideos();
  }, [currentUser.id]);

  const toggleRecordClip = () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!streamRef.current) {
      setUploadMsg({ ok: false, text: "Turn the camera on first (in Personal signs above)." });
      return;
    }
    const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const r = new MediaRecorder(streamRef.current, { mimeType: type });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      setRecBlob(new Blob(parts, { type: "video/webm" }));
      setFile(null);
      setRecording(false);
    };
    recorder.current = r;
    r.start();
    setRecording(true);
  };

  const upload = async () => {
    const blob = file ?? recBlob;
    if (!blob) {
      setUploadMsg({ ok: false, text: "Choose a video file or record one." });
      return;
    }
    const form = new FormData();
    form.append("file", blob, file?.name ?? "recording.webm");
    form.append("signLanguageId", language);
    for (const [k, v] of Object.entries(vf)) if (v) form.append(k, v);
    form.append("consentConfirmed", String(consent));
    form.append("uploadedBy", currentUser.id);
    setUploading(true);
    setUploadMsg(null);
    try {
      await api.uploadSignVideo(form);
      setUploadMsg({ ok: true, text: "Uploaded. It will be used in calls only after an admin verifies it." });
      setFile(null);
      setRecBlob(null);
      setConsent(false);
      void reloadVideos();
    } catch (err) {
      let text = (err as Error).message;
      try {
        const body = JSON.parse(text);
        if (Array.isArray(body.issues)) text = body.issues.join(" ");
      } catch {
        /* plain-text error */
      }
      setUploadMsg({ ok: false, text });
    } finally {
      setUploading(false);
    }
  };

  const packName = packs.find((p) => p.id === language)?.name ?? language.toUpperCase();
  const modelRow = (info: typeof HAND_MODEL | typeof ASR_MODEL, row: ModelRow, install: () => void, remove: () => Promise<void>) => (
    <div className="ts-model">
      <div className="ts-model-head">
        <strong>{info.name}</strong>
        <span className={`ts-chip ${info.status === "WORKING" ? "ok" : "proto"}`}>{info.status === "WORKING" ? "Working" : "Prototype"}</span>
      </div>
      <p>{info.task}</p>
      <dl>
        <dt>Size</dt><dd>{formatBytes(info.approxBytes)}</dd>
        <dt>Runtime</dt><dd>{info.runtime}</dd>
        <dt>Licence</dt><dd>{info.license}</dd>
        <dt>Source</dt><dd>{info.provenance}</dd>
        {"sha256" in info && (<><dt>SHA-256</dt><dd className="mono">{info.sha256.slice(0, 16)}… (verified on every load)</dd></>)}
      </dl>
      <div className="ts-model-actions">
        <span className="ts-status">
          {row.busy ? `Downloading ${Math.round(row.progress * 100)}%` : row.installed === null ? "Checking…" : row.installed ? "Installed on this device" : "Not installed"}
        </span>
        {row.installed ? (
          <button className="btn btn-secondary btn-sm" disabled={row.busy} onClick={() => void remove().then(refreshModels)}>Remove</button>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={row.busy} onClick={install}>Download</button>
        )}
      </div>
      {row.busy && <div className="ts-progress"><span style={{ width: `${Math.round(row.progress * 100)}%` }} /></div>}
      {row.error && <p className="ts-error">{row.error}</p>}
    </div>
  );

  return (
    <div className="translator-page">
      <header className="translator-header">
        <div>
          <span className="ts-overline">AI Translator</span>
          <h2>Sign Studio</h2>
          <p>Everything here runs on this device. Camera frames and audio are never uploaded.</p>
        </div>
        <label className="ts-lang">
          Sign language
          <select className="pref-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {(packs.length ? packs : [{ id: "isl", name: "Indian Sign Language" } as SignLanguagePack]).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="ts-honest">
        <strong>What works today.</strong> Hand tracking with 7 built-in gestures (MediaPipe) and offline speech captions (Whisper) are
        real pretrained models. Recognising actual signs is a <em>personal prototype</em>: it learns only the signs you record below and maps each one to the
        English you type. It is not a trained {packName} model, does not understand sign grammar, and will not recognise
        other people's signing reliably. No trained {packName} recognition model exists in this app yet.
      </div>

      <div className="ts-grid">
        <section className="ts-card">
          <h3>On-device models</h3>
          {modelRow(HAND_MODEL, hand, () => void installHand(), removeHandModel)}
          {modelRow(ASR_MODEL, asr, () => void installAsr(), removeAsrModel)}
          <div className="ts-model">
            <div className="ts-model-head">
              <strong>Trained {packName} recognition model</strong>
              <span className={`ts-chip ${published ? "proto" : ""}`}>{published ? `v${published.manifest.version}` : "None yet"}</span>
            </div>
            {published === undefined && <p>Checking…</p>}
            {published === null && (
              <p>
                No trained {packName} model has been published. Build one: collect recordings below, have an admin approve and export them,
                run <code>ai/signconnect_ai/train.py</code>, then upload the result in the admin console.
              </p>
            )}
            {published && (
              <>
                <p>Recognises {published.manifest.labels.length} signs: {published.manifest.labels.map((l) => l.gloss).join(", ")}</p>
                <dl>
                  <dt>Test accuracy</dt>
                  <dd>
                    {published.manifest.metrics.testAccuracy === null ? "n/a" : `${Math.round(published.manifest.metrics.testAccuracy * 100)}%`} on {published.manifest.metrics.testSamples} held-out samples
                    {published.manifest.metrics.signerIndependent ? " (signers not seen in training)" : " (NOT signer-independent: optimistic)"}
                  </dd>
                  <dt>Training data</dt><dd>{published.manifest.metrics.trainSamples} samples from {published.manifest.metrics.signers} signers</dd>
                  <dt>Architecture</dt><dd>{published.manifest.architecture} · confidence threshold {Math.round(published.manifest.threshold * 100)}%</dd>
                  <dt>SHA-256</dt><dd className="mono">{published.sha256.slice(0, 16)}… (verified on every load)</dd>
                </dl>
                <div className="ts-model-actions">
                  <span className="ts-status">{pubBusy ? "Downloading…" : pubCached ? "Installed on this device" : "Not installed"}</span>
                  {pubCached ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => void removeCachedModel(published).then(refreshPublished)}>Remove</button>
                  ) : (
                    <button className="btn btn-primary btn-sm" disabled={pubBusy} onClick={() => void installPublished()}>Download</button>
                  )}
                </div>
              </>
            )}
            {pubError && <p className="ts-error">{pubError}</p>}
          </div>
          <p className="ts-footnote">Models are verified by SHA-256 on every load. An admin can roll back to an earlier version. Not implemented yet: digital signatures.</p>
        </section>

        <section className="ts-card">
          <h3>Speech captions test</h3>
          <div className="cp-toggle-row">
            <div>
              <strong>Microphone captions</strong>
              <span>{capState === "idle" ? "Whisper tiny (English), offline" : capState === "loading" ? `Loading model ${capDetail ?? ""}` : capState === "error" ? `Error: ${capDetail}` : capState}</span>
            </div>
            <button role="switch" aria-checked={capOn} className={`pref-switch ${capOn ? "on" : ""}`} onClick={() => setCapOn((v) => !v)} aria-label="Microphone captions"><span className="pref-switch-thumb" /></button>
          </div>
          <div className="ts-captions" aria-live="polite">
            {captions.length === 0 && <p className="ts-footnote">Speak in English after turning this on. The first run downloads about 41 MB.</p>}
            {captions.map((c, i) => (
              <p key={i} className={c.final ? "" : "interim"}>{c.text}{c.final ? <span className="ts-latency"> · {c.latencyMs} ms</span> : "…"}</p>
            ))}
          </div>
        </section>

        <section className="ts-card ts-wide">
          <h3>Personal signs · {packName}</h3>
          <div className="ts-camera">
            <video ref={videoRef} className="mirrored" playsInline muted />
            <canvas ref={overlayRef} className="ts-overlay" aria-hidden="true" />
            {!camOn && (
              <div className="ts-camera-off">
                <button className="btn btn-primary" onClick={() => void startCamera()}>Turn on camera</button>
                {camError && <p className="ts-error">{camError}</p>}
              </div>
            )}
            {camOn && (
              <span className="ts-camera-status">
                {trackState === "loading" ? `Loading hand model ${trackDetail ?? ""}` : trackState === "running" ? `${handsNow} hand${handsNow === 1 ? "" : "s"} · ${trackDetail}` : trackState === "error" ? trackDetail : ""}
              </span>
            )}
            {camOn && live && (
              <span className={`ts-detect-badge ${live.gesture ? "hit" : ""}`}>
                {live.gesture && GESTURE_INFO[live.gesture.name as GestureName]
                  ? `${GESTURE_INFO[live.gesture.name as GestureName].emoji} ${GESTURE_INFO[live.gesture.name as GestureName].label} ${Math.round(live.gesture.score * 100)}%`
                  : live.hands ? `${live.hands} hand${live.hands > 1 ? "s" : ""} · no built-in gesture` : "No hands in view"} · {live.fps} fps
              </span>
            )}
            {capture.phase === "countdown" && <span className="ts-countdown">{capture.count}</span>}
            {capture.phase === "recording" && <span className="ts-rec">● Recording: sign now, then lower your hands</span>}
          </div>

          <div className="ts-record-form">
            <input placeholder="Gloss, e.g. THANK-YOU" value={gloss} onChange={(e) => setGloss(e.target.value)} maxLength={40} aria-label="Gloss" />
            <input placeholder="English meaning, e.g. Thank you" value={meaning} onChange={(e) => setMeaning(e.target.value)} maxLength={120} aria-label="English meaning" />
            <button className="btn btn-primary" disabled={!camOn || trackState !== "running" || capture.phase !== "idle"} onClick={() => void recordSample()}>
              Record sample
            </button>
          </div>
          {captureMsg && <p className="ts-msg">{captureMsg}</p>}

          <div className="ts-signs">
            {glossSummary.length === 0 && <p className="ts-footnote">No signs recorded yet. Record each sign at least {MIN_SAMPLES_PER_SIGN} times (5+ is better), with small natural variations.</p>}
            {glossSummary.map(([g, info]) => (
              <div key={g} className="ts-sign">
                <div>
                  <strong>{g}</strong>
                  <span>“{info.meaning}”</span>
                </div>
                <span className={`ts-chip ${info.count >= MIN_SAMPLES_PER_SIGN ? "ok" : "warn"}`}>
                  {info.count} sample{info.count === 1 ? "" : "s"}{info.count < MIN_SAMPLES_PER_SIGN ? ` · need ${MIN_SAMPLES_PER_SIGN}` : ""}
                </span>
                <button className="btn btn-ghost btn-xs" onClick={() => { setGloss(g); setMeaning(info.meaning); }}>Add sample</button>
                <button className="btn btn-ghost btn-xs" onClick={() => void deleteGloss(currentUser.id, language, g).then(reloadSamples)}>Delete</button>
              </div>
            ))}
          </div>

          <div className="ts-test">
            <div className="cp-toggle-row">
              <div>
                <strong>Test recognition</strong>
                <span>Hold a gesture (👍 👎 ✋ ✊ ☝️ ✌️ 🤟) or perform a recorded sign, then lower your hands. {classifier.glossCount} personal signs loaded.</span>
              </div>
              <button role="switch" aria-checked={testing} className={`pref-switch ${testing ? "on" : ""}`} disabled={!camOn || trackState !== "running"} onClick={() => setTesting((v) => !v)} aria-label="Test recognition"><span className="pref-switch-thumb" /></button>
            </div>
            {testing && results.length === 0 && gestureHits.length === 0 && <p className="ts-footnote">Waiting for a sign or gesture…</p>}
            {gestureHits.map((g) => (
              <div key={`g${g.at}`} className="ts-result ok">
                {GESTURE_INFO[g.gesture].emoji} <strong>{GESTURE_INFO[g.gesture].label}</strong> → “{meanings[g.gesture] || "(disabled)"}” <span className="tr-badge">{Math.round(g.score * 100)}%</span> <span className="tr-badge">built-in gesture</span>
              </div>
            ))}
            {results.map((r) => (
              <div key={r.at} className={`ts-result ${r.accepted ? "ok" : "no"}`}>
                {r.accepted ? (
                  <><strong>{r.gloss}</strong> → “{r.meaning}” <span className="tr-badge">{Math.round(r.confidence * 100)}%</span></>
                ) : (
                  <>Not recognised ({r.reason === "AMBIGUOUS" ? `unsure, maybe ${r.bestGloss}` : r.reason === "NO_TEMPLATES" ? "no signs recorded" : r.reason === "TOO_SHORT" ? "too short" : "no close match"})</>
                )}
              </div>
            ))}
          </div>
        </section>


        <DatasetContribution
          currentUser={currentUser}
          language={language}
          languageName={packName}
          cameraReady={camOn && trackState === "running"}
          busy={capture.phase !== "idle"}
          captureSign={captureForDataset}
        />

        <section className="ts-card ts-wide">
          <h3>Built-in gestures</h3>
          <p className="ts-footnote">
            Detected by MediaPipe's pretrained Gesture Recognizer with no training needed. These are general hand gestures,
            not ISL signs. Choose the English text each one sends during a call; leave a box empty to turn that gesture off.
          </p>
          <div className="ts-gesture-grid">
            {GESTURES.map((g) => (
              <label key={g}>
                {GESTURE_INFO[g].emoji} {GESTURE_INFO[g].label}
                <input value={meanings[g]} maxLength={120} onChange={(e) => setMeanings({ ...meanings, [g]: e.target.value })} placeholder="(off)" />
              </label>
            ))}
          </div>
          <div className="ts-upload-row">
            <button className="btn btn-primary btn-sm" onClick={() => setMeaningsSaved(saveGestureMeanings(currentUser.id, meanings) ? "Saved on this device." : "Could not save (browser storage unavailable).")}>Save meanings</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMeanings(defaultMeanings())}>Reset to defaults</button>
            {meaningsSaved && <span className="ts-footnote">{meaningsSaved}</span>}
          </div>
        </section>

        <section className="ts-card ts-wide">
          <h3>Contribute a verified signing video · {packName}</h3>
          <p className="ts-footnote">
            Calls show a human signing video only when a verified recording exists for the exact sentence. Recordings are never
            joined together. New uploads stay unverified until an admin approves them.
          </p>
          <div className="ts-form-grid">
            <label>Unit
              <select className="pref-select" value={vf.unit} onChange={(e) => setVf({ ...vf, unit: e.target.value })}>
                <option value="SENTENCE">Sentence</option><option value="PHRASE">Phrase</option><option value="SIGN">Single sign</option>
              </select>
            </label>
            <label>English sentence it expresses<input value={vf.phraseText} onChange={(e) => setVf({ ...vf, phraseText: e.target.value })} placeholder="How are you?" /></label>
            <label>Gloss<input value={vf.gloss} onChange={(e) => setVf({ ...vf, gloss: e.target.value })} placeholder="YOU HOW" /></label>
            <label>Meaning / notes<input value={vf.meaning} onChange={(e) => setVf({ ...vf, meaning: e.target.value })} placeholder="Greeting asking about wellbeing" /></label>
            <label>Signer ID<input value={vf.signerId} onChange={(e) => setVf({ ...vf, signerId: e.target.value })} placeholder="signer-001" /></label>
            <label>Region<input value={vf.region} onChange={(e) => setVf({ ...vf, region: e.target.value })} placeholder="Mumbai" /></label>
            <label>Quality
              <select className="pref-select" value={vf.quality} onChange={(e) => setVf({ ...vf, quality: e.target.value })}>
                <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </select>
            </label>
            <label>Licence<input value={vf.license} onChange={(e) => setVf({ ...vf, license: e.target.value })} placeholder="Recorded by us, all rights reserved" /></label>
            <label className="ts-span2">Provenance<input value={vf.provenance} onChange={(e) => setVf({ ...vf, provenance: e.target.value })} placeholder="Where, when and by whom it was recorded" /></label>
          </div>
          <div className="ts-upload-row">
            <label className="btn btn-secondary btn-sm">
              Choose file
              <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRecBlob(null); }} />
            </label>
            <button className="btn btn-secondary btn-sm" onClick={toggleRecordClip}>{recording ? "■ Stop recording" : "● Record from camera"}</button>
            <span className="ts-footnote">{file ? file.name : recBlob ? `Recorded clip (${formatBytes(recBlob.size)})` : "No video selected"}</span>
          </div>
          <label className="cp-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            The signer in this video consented to being recorded and to its use in SignConnect.
          </label>
          <button className="btn btn-primary" disabled={uploading} onClick={() => void upload()}>{uploading ? "Uploading…" : "Upload for review"}</button>
          {uploadMsg && <p className={uploadMsg.ok ? "ts-msg" : "ts-error"}>{uploadMsg.text}</p>}

          {myVideos.length > 0 && (
            <div className="ts-videos">
              {myVideos.map((v) => (
                <div key={v.id} className="ts-video">
                  <video src={resolveUrl(v.url)} muted playsInline controls preload="metadata" />
                  <div>
                    <strong>“{v.phraseText}”</strong>
                    <span>{v.signLanguageId.toUpperCase()} · {v.unit.toLowerCase()} · {v.gloss}</span>
                    <span className={`ts-chip ${v.verificationStatus === "VERIFIED" ? "ok" : v.verificationStatus === "REJECTED" ? "bad" : "warn"}`}>{v.verificationStatus.toLowerCase()}</span>
                    {v.reviewNote && <span>Review: {v.reviewNote}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
