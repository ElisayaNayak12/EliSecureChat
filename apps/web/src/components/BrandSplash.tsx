import { useEffect, useRef, useState } from "react";

/**
 * AURA brand splash (Variant B - mark + sparks).
 * Shown after sign-in / cold start. Minimum 2.4s on screen, then exits
 * with a scale-fade so the workspace entrance choreography can run.
 */
interface BrandSplashProps {
  onDone: () => void;
  minDuration?: number;
}

const WORD = "ELiSecureChat";

export default function BrandSplash({ onDone, minDuration = 2600 }: BrandSplashProps) {
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), minDuration);
    const doneTimer = window.setTimeout(() => onDoneRef.current(), minDuration + 460);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, [minDuration]);

  return (
    <div className={`aura-splash ${leaving ? "leave" : ""}`} role="status" aria-label="Loading your workspace">
      <div className="aura-splash-stack">
        <div className="aura-splash-mark">
          <span className="aura-splash-glow" />
          <span className="aura-splash-puck" />
          <svg viewBox="0 0 112 112" aria-hidden="true">
            {/* chat bubble outline */}
            <path
              className="aura-splash-letter"
              pathLength={1}
              d="M30 40 a12 12 0 0 1 12 -12 h28 a12 12 0 0 1 12 12 v18 a12 12 0 0 1 -12 12 h-20 l-12 10 v-10 a8 8 0 0 1 -8 -8 z"
            />
            {/* lock inside */}
            <path className="aura-splash-letter lock" pathLength={1} d="M48 52 h16 v10 h-16 z M51 52 v-4 a5 5 0 0 1 10 0 v4" />
            <g>
              <path className="aura-splash-spark" d="M86 26 L96 16" />
              <path className="aura-splash-spark" d="M89 34 L102 33" />
              <path className="aura-splash-spark" d="M80 20 L81 7" />
            </g>
          </svg>
        </div>
        <div className="aura-splash-word" aria-hidden="true">
          {WORD.split("").map((ch, i) => (
            <span key={i} style={{ animationDelay: `${700 + i * 50}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <div className="aura-splash-tagline">
          Securing your workspace
          <span className="aura-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}
