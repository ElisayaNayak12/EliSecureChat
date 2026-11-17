/**
 * "Leafy" sticker pack: 23 original stickers drawn as SVG (no image files, no third-party art).
 * A sticker is sent as an end-to-end encrypted message whose text is "::sticker:<id>::".
 */
import type { ReactNode } from "react";

type Eyes = "dot" | "happy" | "closed" | "heart" | "star" | "wide" | "wink" | "x" | "sad" | "angry" | "shades" | "look-up";
type Mouth = "smile" | "grin" | "o" | "flat" | "frown" | "tongue" | "small" | "wavy" | "kiss";
type Extra =
  | "hearts" | "tear" | "zzz" | "sparkles" | "party" | "coffee" | "wave" | "thumb" | "sweat" | "question" | "steam"
  | "sun" | "moon" | "thermo" | "flower" | "gift" | "check" | "fire" | "blush" | "confetti" | "laptop" | "food" | "cross";

export type Sticker = {
  id: string;
  label: string;
  moods: string[];
  eyes: Eyes;
  mouth: Mouth;
  extras?: Extra[];
  /** body colours: light, mid, dark */
  tint?: [string, string, string];
  caption?: string;
};

const GREEN: [string, string, string] = ["#B9DA9A", "#6FA25F", "#3E6B3E"];
const PINK: [string, string, string] = ["#FFC7D6", "#F07BA0", "#B8436A"];
const BLUE: [string, string, string] = ["#C4DDF7", "#6FA6DB", "#3D6E9E"];
const RED: [string, string, string] = ["#FFC0A8", "#F0714D", "#B23E22"];
const GOLD: [string, string, string] = ["#FFE7A3", "#F2C14E", "#B88A1E"];
const SICK: [string, string, string] = ["#E1E8A8", "#B7C267", "#7C8636"];
const NIGHT: [string, string, string] = ["#C9C6F2", "#7F7AD6", "#4B4699"];

export const STICKERS: Sticker[] = [
  { id: "hello", label: "Hello", moods: ["hello", "happy"], eyes: "happy", mouth: "grin", extras: ["wave"], caption: "Hi!" },
  { id: "good-morning", label: "Good morning", moods: ["morning", "hello"], eyes: "happy", mouth: "smile", extras: ["sun"], tint: GOLD, caption: "Good morning" },
  { id: "good-night", label: "Good night", moods: ["night", "sleepy"], eyes: "closed", mouth: "small", extras: ["moon", "zzz"], tint: NIGHT, caption: "Good night" },
  { id: "love", label: "Love you", moods: ["love"], eyes: "heart", mouth: "smile", extras: ["hearts", "blush"], tint: PINK, caption: "Love you" },
  { id: "miss-you", label: "Miss you", moods: ["love", "sad"], eyes: "sad", mouth: "small", extras: ["hearts", "tear"], tint: PINK, caption: "Miss you" },
  { id: "kiss", label: "Kiss", moods: ["love"], eyes: "wink", mouth: "kiss", extras: ["blush"], tint: PINK },
  { id: "laugh", label: "LOL", moods: ["laugh", "happy"], eyes: "closed", mouth: "grin", extras: ["tear"], caption: "LOL" },
  { id: "happy", label: "So happy", moods: ["happy"], eyes: "happy", mouth: "grin", extras: ["sparkles"] },
  { id: "thanks", label: "Thank you", moods: ["thanks"], eyes: "happy", mouth: "smile", extras: ["flower", "blush"], caption: "Thank you!" },
  { id: "ok", label: "OK", moods: ["yes", "ok"], eyes: "dot", mouth: "smile", extras: ["thumb"], caption: "OK" },
  { id: "done", label: "Done", moods: ["yes", "work"], eyes: "happy", mouth: "smile", extras: ["check"], caption: "Done" },
  { id: "no", label: "No", moods: ["no"], eyes: "angry", mouth: "flat", extras: ["cross"], tint: RED, caption: "Nope" },
  { id: "sad", label: "Sad", moods: ["sad"], eyes: "sad", mouth: "frown", extras: ["tear"], tint: BLUE },
  { id: "sorry", label: "Sorry", moods: ["sorry", "sad"], eyes: "sad", mouth: "wavy", extras: ["sweat"], tint: BLUE, caption: "Sorry" },
  { id: "angry", label: "Angry", moods: ["angry"], eyes: "angry", mouth: "frown", extras: ["steam"], tint: RED },
  { id: "wow", label: "Wow", moods: ["surprised"], eyes: "wide", mouth: "o", extras: ["sparkles"], caption: "Wow!" },
  { id: "thinking", label: "Thinking", moods: ["thinking"], eyes: "look-up", mouth: "flat", extras: ["question"] },
  { id: "cool", label: "Cool", moods: ["cool", "happy"], eyes: "shades", mouth: "smile", extras: ["sparkles"], caption: "Cool" },
  { id: "party", label: "Party", moods: ["celebrate", "birthday"], eyes: "happy", mouth: "grin", extras: ["party", "confetti"], tint: GOLD, caption: "Party!" },
  { id: "congrats", label: "Congrats", moods: ["celebrate"], eyes: "star", mouth: "grin", extras: ["gift", "confetti"], tint: GOLD, caption: "Congrats!" },
  { id: "busy", label: "Busy", moods: ["work", "busy"], eyes: "dot", mouth: "flat", extras: ["laptop", "sweat"], caption: "Busy now" },
  { id: "coffee", label: "Coffee", moods: ["morning", "work"], eyes: "closed", mouth: "small", extras: ["coffee"], caption: "Coffee?" },
  { id: "hungry", label: "Hungry", moods: ["food"], eyes: "happy", mouth: "tongue", extras: ["food"], caption: "Hungry" },
  { id: "sick", label: "Not well", moods: ["sick", "sad"], eyes: "x", mouth: "wavy", extras: ["thermo"], tint: SICK, caption: "Not well" },
  { id: "on-fire", label: "On fire", moods: ["celebrate", "cool"], eyes: "star", mouth: "grin", extras: ["fire"], tint: RED },
];

export const STICKER_MOODS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "happy", label: "Happy" },
  { id: "love", label: "Love" },
  { id: "sad", label: "Sad" },
  { id: "celebrate", label: "Celebrate" },
  { id: "thanks", label: "Thanks" },
  { id: "work", label: "Work" },
  { id: "morning", label: "Morning" },
  { id: "night", label: "Night" },
];

function eyesSvg(e: Eyes): ReactNode {
  const ink = "#1F2A22";
  const L = 46, R = 74, Y = 60;
  switch (e) {
    case "dot": return <><circle cx={L} cy={Y} r={4.5} fill={ink} /><circle cx={R} cy={Y} r={4.5} fill={ink} /></>;
    case "happy": return <g fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round"><path d={`M${L - 6} ${Y + 2} Q${L} ${Y - 6} ${L + 6} ${Y + 2}`} /><path d={`M${R - 6} ${Y + 2} Q${R} ${Y - 6} ${R + 6} ${Y + 2}`} /></g>;
    case "closed": return <g fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round"><path d={`M${L - 6} ${Y - 1} Q${L} ${Y + 5} ${L + 6} ${Y - 1}`} /><path d={`M${R - 6} ${Y - 1} Q${R} ${Y + 5} ${R + 6} ${Y - 1}`} /></g>;
    case "heart": return <g fill="#E8335F">{[L, R].map((x) => <path key={x} d={`M${x} ${Y + 6} C${x - 10} ${Y - 1} ${x - 6} ${Y - 9} ${x} ${Y - 4} C${x + 6} ${Y - 9} ${x + 10} ${Y - 1} ${x} ${Y + 6}Z`} />)}</g>;
    case "star": return <g fill="#FFFFFF" stroke={ink} strokeWidth={1.5}>{[L, R].map((x) => <path key={x} d={`M${x} ${Y - 8} L${x + 2.4} ${Y - 2.4} L${x + 8} ${Y - 2} L${x + 3.6} ${Y + 1.8} L${x + 5} ${Y + 7.6} L${x} ${Y + 4.4} L${x - 5} ${Y + 7.6} L${x - 3.6} ${Y + 1.8} L${x - 8} ${Y - 2} L${x - 2.4} ${Y - 2.4}Z`} />)}</g>;
    case "wide": return <>{[L, R].map((x) => <g key={x}><circle cx={x} cy={Y} r={8} fill="#fff" stroke={ink} strokeWidth={2} /><circle cx={x} cy={Y + 1} r={4} fill={ink} /><circle cx={x + 1.5} cy={Y - 1} r={1.3} fill="#fff" /></g>)}</>;
    case "wink": return <><circle cx={L} cy={Y} r={4.5} fill={ink} /><path d={`M${R - 6} ${Y} Q${R} ${Y + 5} ${R + 6} ${Y}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" /></>;
    case "x": return <g stroke={ink} strokeWidth={3.5} strokeLinecap="round">{[L, R].map((x) => <g key={x}><path d={`M${x - 5} ${Y - 5} L${x + 5} ${Y + 5}`} /><path d={`M${x + 5} ${Y - 5} L${x - 5} ${Y + 5}`} /></g>)}</g>;
    case "sad": return <><circle cx={L} cy={Y + 1} r={4.5} fill={ink} /><circle cx={R} cy={Y + 1} r={4.5} fill={ink} /><g stroke={ink} strokeWidth={3} strokeLinecap="round"><path d={`M${L - 8} ${Y - 8} L${L + 4} ${Y - 12}`} /><path d={`M${R + 8} ${Y - 8} L${R - 4} ${Y - 12}`} /></g></>;
    case "angry": return <><circle cx={L} cy={Y + 2} r={4.5} fill={ink} /><circle cx={R} cy={Y + 2} r={4.5} fill={ink} /><g stroke={ink} strokeWidth={3.5} strokeLinecap="round"><path d={`M${L - 8} ${Y - 10} L${L + 6} ${Y - 5}`} /><path d={`M${R + 8} ${Y - 10} L${R - 6} ${Y - 5}`} /></g></>;
    case "shades": return <g><path d={`M${L - 12} ${Y - 6} H${R + 12} V${Y - 2}`} stroke={ink} strokeWidth={3} fill="none" /><rect x={L - 11} y={Y - 6} width={20} height={12} rx={5} fill={ink} /><rect x={R - 9} y={Y - 6} width={20} height={12} rx={5} fill={ink} /><path d={`M${L - 6} ${Y - 3} l5 0`} stroke="#fff" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" /></g>;
    case "look-up": return <>{[L, R].map((x) => <g key={x}><circle cx={x} cy={Y} r={7} fill="#fff" stroke={ink} strokeWidth={2} /><circle cx={x + 2} cy={Y - 3} r={3.5} fill={ink} /></g>)}</>;
  }
}

function mouthSvg(m: Mouth): ReactNode {
  const ink = "#1F2A22";
  const Y = 76;
  switch (m) {
    case "smile": return <path d={`M50 ${Y} Q60 ${Y + 9} 70 ${Y}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />;
    case "grin": return <><path d={`M47 ${Y - 2} Q60 ${Y + 16} 73 ${Y - 2} Z`} fill={ink} /><path d={`M52 ${Y + 6} Q60 ${Y + 11} 68 ${Y + 6}`} fill="#F07B8A" /></>;
    case "o": return <ellipse cx={60} cy={Y + 3} rx={5.5} ry={7} fill={ink} />;
    case "flat": return <path d={`M52 ${Y + 2} H68`} stroke={ink} strokeWidth={4} strokeLinecap="round" />;
    case "frown": return <path d={`M50 ${Y + 6} Q60 ${Y - 3} 70 ${Y + 6}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />;
    case "tongue": return <><path d={`M49 ${Y} Q60 ${Y + 10} 71 ${Y}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" /><path d={`M57 ${Y + 4} Q57 ${Y + 13} 62 ${Y + 13} Q67 ${Y + 13} 66 ${Y + 4}`} fill="#F07B8A" stroke={ink} strokeWidth={2} /></>;
    case "small": return <path d={`M55 ${Y + 1} Q60 ${Y + 5} 65 ${Y + 1}`} fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />;
    case "wavy": return <path d={`M49 ${Y + 3} q4 -4 8 0 t8 0 t8 0`} fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />;
    case "kiss": return <path d={`M58 ${Y - 3} q6 3 0 5 q6 3 0 6`} fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />;
  }
}

const heart = (x: number, y: number, s: number, fill = "#F0507A", key?: string) => (
  <path key={key} transform={`translate(${x} ${y}) scale(${s})`} d="M0 6 C-10 -1 -6 -9 0 -4 C6 -9 10 -1 0 6Z" fill={fill} />
);

function extraSvg(x: Extra): ReactNode {
  switch (x) {
    case "hearts": return <g>{heart(18, 26, 1.1, "#F0507A", "a")}{heart(100, 20, 0.9, "#FF7EA0", "b")}{heart(104, 46, 0.6, "#F0507A", "c")}</g>;
    case "tear": return <path d="M80 66 q4 8 0 11 q-4 -3 0 -11Z" fill="#6EC3F5" stroke="#2F7FB5" strokeWidth={1} />;
    case "zzz": return <g fill="#4B4699" fontFamily="Arial, sans-serif" fontWeight={800}><text x={88} y={30} fontSize={14}>Z</text><text x={99} y={20} fontSize={11}>z</text><text x={107} y={12} fontSize={8}>z</text></g>;
    case "sparkles": return <g fill="#FFC93C">{[[18, 30, 1], [102, 26, 0.8], [98, 92, 0.6]].map(([cx, cy, s], i) => <path key={i} transform={`translate(${cx} ${cy}) scale(${s})`} d="M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4Z" />)}</g>;
    case "party": return <g><path d="M60 4 L72 26 L48 26Z" fill="#7C6CF2" /><path d="M54 14 L66 14 M51 20 L69 20" stroke="#FFD24A" strokeWidth={2.5} /><circle cx={60} cy={4} r={3.5} fill="#FF6FA0" /></g>;
    case "coffee": return <g><rect x={84} y={74} width={20} height={20} rx={4} fill="#FFFFFF" stroke="#6B4A33" strokeWidth={2.5} /><path d="M104 79 q7 0 7 6 q0 6 -7 6" fill="none" stroke="#6B4A33" strokeWidth={2.5} /><path d="M89 68 q-3 -4 0 -8 M96 68 q-3 -4 0 -8" stroke="#9C8574" strokeWidth={2} fill="none" strokeLinecap="round" /></g>;
    case "wave": return <g transform="translate(94 50) rotate(18)"><rect x={-7} y={-2} width={14} height={18} rx={6} fill="#FFD8A8" stroke="#B5794A" strokeWidth={1.5} />{[-6, -2, 2, 6].map((dx, i) => <rect key={i} x={dx - 1.6} y={-12} width={3.4} height={13} rx={1.7} fill="#FFD8A8" stroke="#B5794A" strokeWidth={1.2} />)}<path d="M12 -12 q4 4 0 8 M16 -16 q6 8 0 14" stroke="#B5794A" strokeWidth={1.5} fill="none" /></g>;
    case "thumb": return <g transform="translate(96 74)"><rect x={-8} y={-2} width={16} height={16} rx={4} fill="#FFD8A8" stroke="#B5794A" strokeWidth={1.5} /><rect x={-4} y={-14} width={7} height={14} rx={3.5} fill="#FFD8A8" stroke="#B5794A" strokeWidth={1.5} /></g>;
    case "sweat": return <path d="M84 40 q5 9 0 12 q-5 -3 0 -12Z" fill="#9AD8FA" stroke="#3A8CC0" strokeWidth={1} />;
    case "question": return <text x={92} y={34} fontSize={26} fontWeight={800} fill="#5E6C7A" fontFamily="Georgia, serif">?</text>;
    case "steam": return <g fill="#FFFFFF" stroke="#B23E22" strokeWidth={1.5}><path d="M18 30 q-6 -6 0 -12 q8 -2 8 6 q4 6 -4 8Z" /><path d="M100 26 q6 -6 0 -12 q-8 -2 -8 6 q-4 6 4 8Z" /></g>;
    case "sun": return <g><circle cx={100} cy={20} r={9} fill="#FFC93C" />{Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return <path key={i} d={`M${100 + Math.cos(a) * 12} ${20 + Math.sin(a) * 12} L${100 + Math.cos(a) * 16} ${20 + Math.sin(a) * 16}`} stroke="#FFC93C" strokeWidth={2.5} strokeLinecap="round" />; })}</g>;
    case "moon": return <path d="M24 10 a12 12 0 1 0 12 16 a9 9 0 1 1 -12 -16Z" fill="#FFE08A" />;
    case "thermo": return <g transform="translate(82 74) rotate(-30)"><rect x={-3} y={-4} width={6} height={22} rx={3} fill="#FFFFFF" stroke="#5E6C7A" strokeWidth={1.5} /><circle cx={0} cy={20} r={5} fill="#F0503C" /><rect x={-1.2} y={6} width={2.4} height={12} fill="#F0503C" /></g>;
    case "flower": return <g transform="translate(98 84)">{[0, 72, 144, 216, 288].map((r) => <ellipse key={r} rx={5} ry={8} transform={`rotate(${r}) translate(0 -7)`} fill="#FF8FB1" />)}<circle r={4.5} fill="#FFD24A" /></g>;
    case "gift": return <g transform="translate(98 80)"><rect x={-11} y={-6} width={22} height={18} rx={3} fill="#F0507A" /><rect x={-13} y={-11} width={26} height={7} rx={2} fill="#FF7EA0" /><rect x={-2} y={-11} width={4} height={23} fill="#FFD24A" /></g>;
    case "check": return <g transform="translate(98 82)"><circle r={12} fill="#2FB36B" /><path d="M-6 0 L-1.5 5 L6.5 -5" stroke="#fff" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>;
    case "fire": return <path d="M60 2 C72 14 80 22 72 32 C76 26 70 20 66 18 C68 26 60 30 56 24 C54 30 48 28 48 22 C44 14 54 10 60 2Z" fill="#FF8A2B" />;
    case "blush": return <g fill="#FF8FA6" opacity={0.65}><ellipse cx={38} cy={70} rx={6} ry={3.5} /><ellipse cx={82} cy={70} rx={6} ry={3.5} /></g>;
    case "confetti": return <g>{[[16, 20, "#7C6CF2", 20], [28, 8, "#FFD24A", -30], [94, 10, "#2FB36B", 40], [106, 34, "#F0507A", -10], [14, 46, "#3AA0F0", 60]].map(([x, y, c, r], i) => <rect key={i} x={Number(x)} y={Number(y)} width={6} height={3} rx={1} fill={String(c)} transform={`rotate(${r} ${x} ${y})`} />)}</g>;
    case "laptop": return <g transform="translate(92 82)"><rect x={-13} y={-10} width={26} height={16} rx={2} fill="#3B4252" /><rect x={-11} y={-8} width={22} height={12} rx={1} fill="#8FC2FF" /><rect x={-16} y={6} width={32} height={3.5} rx={1.5} fill="#5E6779" /></g>;
    case "food": return <g transform="translate(96 82)"><circle r={12} fill="#F4C27A" /><circle r={9} fill="#E2563B" /><circle cx={-3} cy={-2} r={2} fill="#FFE6A8" /><circle cx={3} cy={3} r={2} fill="#FFE6A8" /><circle cx={3} cy={-4} r={1.5} fill="#3E6B3E" /></g>;
    case "cross": return <g transform="translate(98 82)"><circle r={12} fill="#E5484D" /><path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" /></g>;
  }
}

export function LeafySticker({ sticker, size = 112 }: { sticker: Sticker; size?: number }) {
  const [light, mid, dark] = sticker.tint ?? GREEN;
  const gid = `lf-${sticker.id}`;
  return (
    <svg className="leafy-sticker" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${sticker.label} sticker`}>
      <defs>
        <radialGradient id={gid} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      {/* white sticker outline */}
      <path d="M60 10 C99 28 108 72 60 112 C12 72 21 28 60 10Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={8} strokeLinejoin="round" />
      <path d="M60 10 C99 28 108 72 60 112 C12 72 21 28 60 10Z" fill={`url(#${gid})`} />
      <path d="M60 16 V104" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx={46} cy={32} rx={9} ry={5} fill="#FFFFFF" opacity={0.35} transform="rotate(-30 46 32)" />
      {eyesSvg(sticker.eyes)}
      {mouthSvg(sticker.mouth)}
      {sticker.extras?.map((x) => <g key={x}>{extraSvg(x)}</g>)}
      {sticker.caption && (
        <g>
          <rect x={60 - sticker.caption.length * 3.6 - 8} y={96} width={sticker.caption.length * 7.2 + 16} height={20} rx={10} fill="#FFFFFF" stroke={dark} strokeWidth={2} />
          <text x={60} y={110} textAnchor="middle" fontSize={12} fontWeight={800} fill={dark} fontFamily="Inter, Arial, sans-serif">{sticker.caption}</text>
        </g>
      )}
    </svg>
  );
}

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);
