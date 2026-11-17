import { useEffect, useMemo, useRef, useState } from "react";
import { ALPHABETS, SPEEDS, preload, sentenceWords, tokenDuration, tokenize, type SignAlphabet, type SpellSpeed, type SpellToken } from "../ai/fingerspell";

export type SpellItem = { id: string; text: string };

type Props = {
  items: SpellItem[];
  alphabet: SignAlphabet;
  /** Title over the player, e.g. "Ravi said" or "What Asha sees". */
  title: string;
  /** Compact = the hearing person's preview; full = the Deaf person's main view. */
  compact?: boolean;
  emptyText: string;
};

/**
 * Plays sentences as real fingerspelling photos, one letter at a time, in order. New sentences queue up; if
 * more than two are waiting, it jumps to the newest so the Deaf person never falls far behind the call.
 */
export default function FingerspellPlayer({ items, alphabet, title, compact, emptyText }: Props) {
  const [speed, setSpeed] = useState<SpellSpeed>("normal");
  const [paused, setPaused] = useState(false);
  const [itemIdx, setItemIdx] = useState(0);
  const [tokIdx, setTokIdx] = useState(0);
  const seen = useRef(0);

  // Follow the queue: start on the first new sentence; skip ahead when too far behind.
  useEffect(() => {
    if (items.length === seen.current) return;
    const firstNew = seen.current;
    seen.current = items.length;
    items.slice(firstNew).forEach((it) => preload(tokenize(it.text, alphabet)));
    // The playback loop moves on to the next sentence by itself; only jump when far behind the live call.
    setItemIdx((cur) => (items.length - 1 - cur > 2 ? items.length - 1 : cur));
  }, [items, alphabet]);

  const item = items[itemIdx];
  const tokens = useMemo<SpellToken[]>(() => (item ? tokenize(item.text, alphabet) : []), [item, alphabet]);
  const words = useMemo(() => (item ? sentenceWords(item.text) : []), [item]);
  const done = !item || tokIdx >= tokens.length;

  useEffect(() => setTokIdx(0), [itemIdx, alphabet]);

  useEffect(() => {
    if (paused || !item) return;
    if (tokIdx >= tokens.length) {
      if (itemIdx < items.length - 1) {
        const t = window.setTimeout(() => setItemIdx((i) => i + 1), 700);
        return () => window.clearTimeout(t);
      }
      return;
    }
    const t = window.setTimeout(() => setTokIdx((i) => i + 1), tokenDuration(tokens[tokIdx], speed));
    return () => window.clearTimeout(t);
  }, [paused, item, tokIdx, tokens, speed, itemIdx, items.length]);

  const current = tokens[Math.min(tokIdx, tokens.length - 1)];
  const wordNow = current && current.kind !== "gap" ? current.word : current ? (tokens[tokIdx + 1] as { word?: number } | undefined)?.word ?? -1 : -1;
  const wordLetters = tokens.filter((t) => t.kind === "letter" && t.word === wordNow) as Extract<SpellToken, { kind: "letter" }>[];
  const letterPos = tokens.slice(0, tokIdx + 1).filter((t) => t.kind === "letter" && t.word === wordNow).length - 1;
  // A double letter (the LL in HELLO) shows the same photo twice: mark the second one so it is noticed.
  const prev = tokens[tokIdx - 1];
  const isRepeat = current?.kind === "letter" && prev?.kind === "letter" && prev.char === current.char && prev.word === current.word;

  return (
    <div className={`fs-player ${compact ? "compact" : ""}`} aria-live="polite">
      <div className="fs-head">
        <span className="fs-title">{title}</span>
        <span className="fs-lang" title={ALPHABETS[alphabet].name}>{ALPHABETS[alphabet].short} fingerspelling</span>
      </div>

      {!item ? (
        <p className="fs-empty">{emptyText}</p>
      ) : (
        <>
          <div className={`fs-stage ${done ? "done" : ""}`}>
            {current?.kind === "letter" && !done && (
              <>
                <img key={`${itemIdx}-${tokIdx}`} className="fs-photo" src={current.src} alt={`${ALPHABETS[alphabet].short} letter ${current.char}`} />
                <span className="fs-letter">{current.char}</span>
                {isRepeat && <span className="fs-repeat">again</span>}
              </>
            )}
            {current?.kind === "text" && !done && <span className="fs-textcard">{current.text}<small>shown as text</small></span>}
            {current?.kind === "gap" && !done && <span className="fs-gap">·</span>}
            {done && <span className="fs-done">{items.length - 1 > itemIdx ? "Next sentence…" : "Done"}</span>}
            {!done && <span className="fs-progress" style={{ width: `${Math.round(((tokIdx + 1) / tokens.length) * 100)}%` }} />}
          </div>

          {!compact && wordLetters.length > 0 && (
            <div className="fs-word" aria-hidden="true">
              {wordLetters.map((t, i) => (
                <span key={i} className={`fs-chip ${i === letterPos ? "now" : i < letterPos ? "past" : ""}`}>
                  <img src={t.src} alt="" />
                  <b>{t.char}</b>
                </span>
              ))}
            </div>
          )}

          <p className="fs-sentence">
            {words.map((w, i) => (
              <span key={i} className={i === wordNow && !done ? "now" : i < wordNow || done ? "past" : ""}>
                {w}{" "}
              </span>
            ))}
          </p>
        </>
      )}

      <div className="fs-controls">
        <div className="fs-speed" role="radiogroup" aria-label="Spelling speed">
          {(Object.keys(SPEEDS) as SpellSpeed[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
              {SPEEDS[s].label}
            </button>
          ))}
        </div>
        <button type="button" className="fs-btn" onClick={() => setPaused((p) => !p)} disabled={!item}>{paused ? "Play" : "Pause"}</button>
        <button type="button" className="fs-btn" onClick={() => { setTokIdx(0); setPaused(false); }} disabled={!item}>Replay</button>
      </div>
    </div>
  );
}
