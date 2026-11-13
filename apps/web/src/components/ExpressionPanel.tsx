import { useMemo, useState } from "react";
import { LeafySticker, STICKERS, STICKER_MOODS } from "../stickers/leafy";
import { EMOJI_GROUPS, GIFS, type MoodGif } from "../stickers/expressions";

export function GifCard({ gif, small }: { gif: MoodGif; small?: boolean }) {
  return (
    <div className={`gif-card anim-${gif.anim} ${small ? "small" : ""}`} style={{ background: gif.bg }} role="img" aria-label={`${gif.label} animation`}>
      <div className="gif-emoji">
        {gif.emoji.map((e, i) => (
          <span key={i} style={{ animationDelay: `${i * 160}ms` }}>{e}</span>
        ))}
      </div>
      <strong className="gif-caption">{gif.caption}</strong>
      <span className="gif-badge">GIF</span>
    </div>
  );
}

type Tab = "emoji" | "stickers" | "gifs";

type Props = {
  onEmoji: (e: string) => void;
  onSticker: (id: string) => void;
  onGif: (id: string) => void;
  onClose: () => void;
};

/** Emoji, Leafy stickers and mood GIFs in one panel, like modern messengers - grouped by mood and situation. */
export default function ExpressionPanel({ onEmoji, onSticker, onGif, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [group, setGroup] = useState(EMOJI_GROUPS[0].id);
  const [mood, setMood] = useState("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const emoji = useMemo(() => {
    if (!q) return EMOJI_GROUPS.find((g) => g.id === group)?.emoji ?? [];
    return EMOJI_GROUPS.filter((g) => g.label.toLowerCase().includes(q) || g.id.includes(q)).flatMap((g) => g.emoji);
  }, [group, q]);
  const stickers = STICKERS.filter((s) => (mood === "all" || s.moods.includes(mood)) && (!q || s.label.toLowerCase().includes(q) || s.moods.some((m) => m.includes(q))));
  const gifs = GIFS.filter((g) => (mood === "all" || g.moods.includes(mood)) && (!q || g.label.toLowerCase().includes(q) || g.moods.some((m) => m.includes(q))));

  return (
    <div className="expr-panel animate-slide-up" role="dialog" aria-label="Emoji, stickers and GIFs">
      <div className="expr-top">
        <div className="expr-tabs" role="tablist">
          {(["emoji", "stickers", "gifs"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "emoji" ? "Emoji" : t === "stickers" ? "Stickers" : "GIFs"}
            </button>
          ))}
        </div>
        <input className="expr-search" placeholder={tab === "emoji" ? "Search mood (happy, love…)" : "Search (thanks, party…)"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        <button type="button" className="expr-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {tab === "emoji" ? (
        <>
          {!q && (
            <div className="expr-groups" role="tablist" aria-label="Emoji by mood">
              {EMOJI_GROUPS.map((g) => (
                <button key={g.id} type="button" title={g.label} aria-label={g.label} className={group === g.id ? "on" : ""} onClick={() => setGroup(g.id)}>
                  <span>{g.icon}</span>
                  <small>{g.label}</small>
                </button>
              ))}
            </div>
          )}
          <div className="expr-emoji-grid">
            {emoji.map((e, i) => (
              <button key={`${e}-${i}`} type="button" onClick={() => onEmoji(e)} aria-label={e}>{e}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="expr-moods" role="radiogroup" aria-label="Mood">
            {STICKER_MOODS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} className={mood === m.id ? "on" : ""} onClick={() => setMood(m.id)}>{m.label}</button>
            ))}
          </div>
          {tab === "stickers" ? (
            <div className="expr-sticker-grid">
              {stickers.map((s) => (
                <button key={s.id} type="button" onClick={() => onSticker(s.id)} title={s.label} aria-label={`Send ${s.label} sticker`}>
                  <LeafySticker sticker={s} size={84} />
                </button>
              ))}
              {!stickers.length && <p className="expr-empty">No stickers for this mood yet.</p>}
            </div>
          ) : (
            <div className="expr-gif-grid">
              {gifs.map((g) => (
                <button key={g.id} type="button" onClick={() => onGif(g.id)} aria-label={`Send ${g.label} GIF`}>
                  <GifCard gif={g} small />
                </button>
              ))}
              {!gifs.length && <p className="expr-empty">No GIFs for this mood yet.</p>}
            </div>
          )}
          <p className="expr-foot">{tab === "stickers" ? "Leafy sticker pack · original art" : "Animated cards · made in the app, nothing loaded from other sites"}</p>
        </>
      )}
    </div>
  );
}
