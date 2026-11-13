import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 300;

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/**
 * Tap to record a voice message, tap again to send, or cancel. Recording happens in the browser;
 * the audio is uploaded only when the user sends it.
 */
export default function VoiceRecorder({ disabled, onRecorded, onError }: { disabled?: boolean; onRecorded: (file: File) => void | Promise<void>; onError: (msg: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop());

  useEffect(() => () => {
    window.clearInterval(timer.current);
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
  }, []);

  const start = async () => {
    const mime = pickMime();
    if (!mime) {
      onError("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      chunks.current = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stopTracks();
        window.clearInterval(timer.current);
        setRecording(false);
        if (cancelled.current || !chunks.current.length) return;
        const type = mime.split(";")[0];
        const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const file = new File(chunks.current, `voice-message-${Date.now()}.${ext}`, { type });
        void onRecorded(file);
      };
      recorder.current = r;
      r.start(250);
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) r.stop();
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      onError((err as Error).name === "NotAllowedError" ? "Microphone permission was denied." : (err as Error).message);
    }
  };

  const stop = (send: boolean) => {
    cancelled.current = !send;
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  if (!recording) {
    return (
      <button type="button" className="btn-composer-action" onClick={() => void start()} disabled={disabled} title="Record voice message" aria-label="Record voice message">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
        </svg>
      </button>
    );
  }
  return (
    <div className="voice-recording" role="status" aria-live="polite">
      <span className="voice-dot" aria-hidden="true" />
      <span className="voice-time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => stop(false)} aria-label="Cancel recording">Cancel</button>
      <button type="button" className="btn btn-primary btn-xs" onClick={() => stop(true)} aria-label="Send voice message">Send</button>
    </div>
  );
}
