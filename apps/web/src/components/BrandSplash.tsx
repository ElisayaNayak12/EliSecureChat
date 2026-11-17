import { useEffect, useRef, useState } from "react";
import { BUBBLE_PATH, Hand, Seal, Wordmark } from "./BrandMark";

/**
 * Launch animation (approved design): the bubble pops in, the "I love you" hand rises and waves, the gold seal
 * clicks shut, then the name and promise appear. Under 4 seconds; "Reduce motion" gets a short fade.
 */
interface BrandSplashProps {
  onDone: () => void;
}

const reduceMotion = () =>
  document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Plays the full animation on the first open of the day; a quick fade after that. */
export function splashDuration(): number {
  if (reduceMotion()) return 700;
  const today = new Date().toDateString();
  try {
    if (localStorage.getItem("splash-day") === today) return 900;
    localStorage.setItem("splash-day", today);
  } catch {
    // storage unavailable: just play it
  }
  return 3500;
}

export default function BrandSplash({ onDone }: BrandSplashProps) {
  const [duration] = useState(splashDuration);
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const short = duration < 1000;

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), duration);
    const doneTimer = window.setTimeout(() => onDoneRef.current(), duration + 420);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, [duration]);

  return (
    <div className={`brand-splash ${short ? "short" : ""} ${leaving ? "leave" : ""}`} role="status" aria-label="Opening EliSecureChat">
      <div className="brand-splash-stack">
        <svg className="brand-splash-mark" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <radialGradient id="splashBubble" cx="30%" cy="22%" r="95%">
              <stop offset="0" stopColor="#7FB069" />
              <stop offset=".55" stopColor="#2F5A37" />
              <stop offset="1" stopColor="#15291C" />
            </radialGradient>
          </defs>
          <g className="bs-bubble">
            <path d={BUBBLE_PATH} fill="url(#splashBubble)" />
            <path d={BUBBLE_PATH} fill="none" stroke="#FFFFFF" strokeOpacity=".16" strokeWidth="1.5" />
          </g>
          <g className="bs-hand">
            <g className="bs-wave">
              <Hand />
            </g>
          </g>
          <circle className="bs-ring" cx="95" cy="22" r="13" fill="none" stroke="#E3C27E" strokeWidth="3" />
          <g className="bs-seal">
            <Seal />
          </g>
        </svg>
        <div className="bs-word">
          <Wordmark />
        </div>
        <div className="bs-tag">Private conversations, signed or spoken.</div>
        <div className="bs-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
