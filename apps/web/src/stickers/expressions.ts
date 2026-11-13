/**
 * Emoji grouped by mood and situation, animated "GIF" cards (pure CSS animation, no downloads, nothing sent
 * to third parties), smart suggestions from what the user is typing, and the message encoding for rich items.
 */
import { STICKERS, type Sticker } from "./leafy";

export type MoodGif = { id: string; label: string; moods: string[]; emoji: string[]; anim: "bounce" | "float" | "pulse" | "spin" | "wiggle" | "rain" | "pop"; bg: string; caption: string };

export const GIFS: MoodGif[] = [
  { id: "party-time", label: "Party time", moods: ["celebrate", "birthday"], emoji: ["🎉", "🥳", "🎊"], anim: "pop", bg: "linear-gradient(135deg,#7C6CF2,#F0507A)", caption: "Party time!" },
  { id: "happy-birthday", label: "Happy birthday", moods: ["birthday", "celebrate"], emoji: ["🎂", "🎈", "🎁"], anim: "float", bg: "linear-gradient(135deg,#FF9A8B,#FF6A88 55%,#FF99AC)", caption: "Happy birthday!" },
  { id: "love-rain", label: "Love rain", moods: ["love"], emoji: ["❤️", "💕", "💖"], anim: "rain", bg: "linear-gradient(135deg,#FFB3C6,#F0507A)", caption: "Sending love" },
  { id: "big-hug", label: "Big hug", moods: ["love", "sad", "sorry"], emoji: ["🤗"], anim: "pulse", bg: "linear-gradient(135deg,#FFD6A5,#FF9F68)", caption: "Big hug" },
  { id: "lol", label: "LOL", moods: ["laugh", "happy"], emoji: ["😂", "🤣"], anim: "wiggle", bg: "linear-gradient(135deg,#FFE259,#FFA751)", caption: "LOL" },
  { id: "thank-you", label: "Thank you", moods: ["thanks"], emoji: ["🙏", "💐"], anim: "bounce", bg: "linear-gradient(135deg,#A8E063,#56AB2F)", caption: "Thank you!" },
  { id: "good-morning", label: "Good morning", moods: ["morning"], emoji: ["☀️", "☕"], anim: "spin", bg: "linear-gradient(135deg,#FDE68A,#F59E0B)", caption: "Good morning" },
  { id: "good-night", label: "Good night", moods: ["night"], emoji: ["🌙", "✨", "😴"], anim: "float", bg: "linear-gradient(135deg,#3B3B98,#1B1464)", caption: "Good night" },
  { id: "congrats", label: "Congrats", moods: ["celebrate"], emoji: ["🏆", "👏", "✨"], anim: "pop", bg: "linear-gradient(135deg,#F7D774,#C8962E)", caption: "Congrats!" },
  { id: "on-my-way", label: "On my way", moods: ["travel", "busy"], emoji: ["🚗", "💨"], anim: "bounce", bg: "linear-gradient(135deg,#74EBD5,#3B82F6)", caption: "On my way" },
  { id: "so-sorry", label: "So sorry", moods: ["sorry", "sad"], emoji: ["🥺", "💧"], anim: "pulse", bg: "linear-gradient(135deg,#A1C4FD,#6A8FD8)", caption: "So sorry" },
  { id: "you-got-this", label: "You got this", moods: ["work", "happy"], emoji: ["💪", "🔥"], anim: "wiggle", bg: "linear-gradient(135deg,#FF8A2B,#E5484D)", caption: "You got this!" },
];

export const EMOJI_GROUPS: { id: string; label: string; icon: string; emoji: string[] }[] = [
  { id: "happy", label: "Happy", icon: "😊", emoji: ["😀", "😃", "😄", "😁", "😆", "😊", "🙂", "😉", "😇", "🥰", "😍", "🤩", "😎", "🤗", "😋", "😌", "🥳", "😺"] },
  { id: "laugh", label: "Funny", icon: "😂", emoji: ["😂", "🤣", "😹", "😜", "😝", "🤪", "😛", "🙃", "🤭", "😏", "🤡", "👻"] },
  { id: "love", label: "Love", icon: "❤️", emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "💕", "💞", "💓", "💖", "💘", "😘", "😚", "💋", "🌹", "💐", "💌"] },
  { id: "sad", label: "Sad", icon: "😢", emoji: ["😢", "😭", "🥺", "😞", "😔", "😟", "😕", "🙁", "😿", "💔", "😪", "😩"] },
  { id: "angry", label: "Upset", icon: "😠", emoji: ["😠", "😡", "🤬", "😤", "😒", "🙄", "😑", "😬", "😾", "👿"] },
  { id: "surprised", label: "Wow", icon: "😮", emoji: ["😮", "😯", "😲", "😳", "🤯", "😱", "🫢", "👀", "‼️", "⁉️"] },
  { id: "celebrate", label: "Celebrate", icon: "🎉", emoji: ["🎉", "🎊", "🥳", "🎂", "🎁", "🎈", "🏆", "🥇", "👏", "🙌", "✨", "🎆", "🍾", "🥂"] },
  { id: "gestures", label: "Hands", icon: "👍", emoji: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤙", "👋", "🙏", "🤝", "💪", "👊", "✋", "🫶"] },
  { id: "sick", label: "Health", icon: "🤒", emoji: ["🤒", "🤕", "🤧", "😷", "🤢", "🥴", "😵", "💊", "🩺", "🛌"] },
  { id: "work", label: "Work", icon: "💼", emoji: ["💼", "💻", "📅", "📝", "📞", "⏰", "✅", "📌", "📊", "☕", "🧠", "🚀"] },
  { id: "food", label: "Food", icon: "🍕", emoji: ["🍕", "🍔", "🍟", "🌮", "🍜", "🍛", "🍣", "🍩", "🍰", "🍫", "🍎", "🥗", "☕", "🍵", "🧃", "🍹"] },
  { id: "travel", label: "Travel", icon: "✈️", emoji: ["✈️", "🚗", "🚕", "🚌", "🚆", "🏍️", "🚲", "🏖️", "🏔️", "🗺️", "🧳", "🏠", "📍"] },
  { id: "nature", label: "Nature", icon: "🌿", emoji: ["🌿", "🍀", "🌱", "🌸", "🌻", "🌈", "☀️", "🌙", "⭐", "⛅", "🌧️", "❄️", "🔥", "🌊", "🐶", "🐱"] },
];

/** Words people type -> moods. Simple, private and on-device (nothing is sent anywhere). */
const KEYWORDS: [RegExp, string][] = [
  [/\b(thanks?|thank you|thx|ty|grateful|dhanyavad|shukriya)\b/i, "thanks"],
  [/\b(birthday|bday|b'day)\b/i, "birthday"],
  [/\b(congrats|congratulations|well done|great job|passed|won|promotion)\b/i, "celebrate"],
  [/\b(party|celebrate|yay|woo+)\b/i, "celebrate"],
  [/\b(love|luv|miss you|hug|darling|sweetheart|❤)\b/i, "love"],
  [/\b(sorry|apolog|my bad|forgive)\b/i, "sorry"],
  [/\b(sad|upset|cry|crying|depressed|hurt)\b/i, "sad"],
  [/\b(haha+|lol|lmao|rofl|funny|hehe)\b/i, "laugh"],
  [/\b(good morning|morning|gm)\b/i, "morning"],
  [/\b(good night|night|gn|sleep|sleepy)\b/i, "night"],
  [/\b(hi|hello|hey|namaste|hola)\b/i, "hello"],
  [/\b(ok|okay|sure|yes|done|agreed|fine)\b/i, "yes"],
  [/\b(busy|meeting|work|office|deadline)\b/i, "work"],
  [/\b(hungry|lunch|dinner|breakfast|food|eat)\b/i, "food"],
  [/\b(sick|fever|ill|unwell|headache|cold)\b/i, "sick"],
  [/\b(wow|omg|amazing|really\?)\b/i, "surprised"],
  [/\b(on my way|omw|coming|reached|travel)\b/i, "travel"],
];

const MOOD_EMOJI: Record<string, string[]> = {
  thanks: ["🙏", "😊", "💐"], birthday: ["🎂", "🥳", "🎁"], celebrate: ["🎉", "👏", "🏆"], love: ["❤️", "🥰", "🤗"],
  sorry: ["🥺", "🙏", "💔"], sad: ["😢", "🤗", "💙"], laugh: ["😂", "🤣", "😹"], morning: ["☀️", "☕", "😊"],
  night: ["🌙", "😴", "✨"], hello: ["👋", "😊", "🙌"], yes: ["👍", "👌", "✅"], work: ["💼", "💪", "⏰"],
  food: ["🍕", "😋", "🍛"], sick: ["🤒", "💊", "🤗"], surprised: ["😮", "🤯", "👀"], travel: ["🚗", "📍", "🏠"],
};

export type Suggestions = { moods: string[]; emoji: string[]; stickers: Sticker[]; gifs: MoodGif[] };

export function suggestFor(text: string): Suggestions | null {
  const t = text.trim();
  if (t.length < 2) return null;
  const moods = [...new Set(KEYWORDS.filter(([re]) => re.test(t)).map(([, m]) => m))];
  if (!moods.length) return null;
  const emoji = [...new Set(moods.flatMap((m) => MOOD_EMOJI[m] ?? []))].slice(0, 5);
  const stickers = STICKERS.filter((s) => s.moods.some((m) => moods.includes(m))).slice(0, 4);
  const gifs = GIFS.filter((g) => g.moods.some((m) => moods.includes(m))).slice(0, 2);
  return { moods, emoji, stickers, gifs };
}

/* ---- message encoding: rich items travel as ordinary E2EE text ---- */
const RICH = /^::(sticker|gif):([a-z0-9-]{1,40})::$/;
export const stickerText = (id: string) => `::sticker:${id}::`;
export const gifText = (id: string) => `::gif:${id}::`;

export type RichItem = { kind: "sticker"; sticker: Sticker } | { kind: "gif"; gif: MoodGif };

export function parseRich(text: string | null | undefined): RichItem | null {
  const m = RICH.exec((text ?? "").trim());
  if (!m) return null;
  if (m[1] === "sticker") {
    const sticker = STICKERS.find((s) => s.id === m[2]);
    return sticker ? { kind: "sticker", sticker } : null;
  }
  const gif = GIFS.find((g) => g.id === m[2]);
  return gif ? { kind: "gif", gif } : null;
}

/** Short label for chat lists and reply previews. */
export function richLabel(text: string): string | null {
  const r = parseRich(text);
  if (!r) return null;
  return r.kind === "sticker" ? `Sticker · ${r.sticker.label}` : `GIF · ${r.gif.label}`;
}
