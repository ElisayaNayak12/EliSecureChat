/**
 * App designs (Settings > Appearance): 5 designs x light/dark, an optional accent colour, bubble style and
 * 10 chat wallpapers. Applied as attributes on <html>; themes.css maps them to the AURA colour tokens.
 * The backend preferences are the source of truth; localStorage is only a render cache so the right look
 * shows before sign-in finishes.
 */
import type { Appearance, AccentId, DesignId, WallpaperId } from "./types";

export const DESIGNS: { id: DesignId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: "verdant", name: "Verdant Glass", blurb: "Forest green, frosted glass", swatch: ["#1A2B1F", "#AFCB98", "#ECEFE7"] },
  { id: "indigo", name: "Indigo Calm", blurb: "Soft indigo, airy and calm", swatch: ["#262A6B", "#7C83F2", "#F1F2FA"] },
  { id: "emerald", name: "Classic Emerald", blurb: "Familiar messenger green", swatch: ["#0B3D33", "#1FAF8B", "#EEF3F0"] },
  { id: "ocean", name: "Ocean Breeze", blurb: "Clear sea blue and sand", swatch: ["#0B2E4A", "#38A3E0", "#EEF5FA"] },
  { id: "midnight", name: "Midnight", blurb: "Deep night with gold light", swatch: ["#0B0D17", "#D8B878", "#1A1D2E"] },
];

export const ACCENTS: { id: AccentId; name: string; color: string }[] = [
  { id: "leaf", name: "Leaf", color: "#6E9A63" },
  { id: "indigo", name: "Indigo", color: "#6366F1" },
  { id: "clay", name: "Clay", color: "#C46A45" },
  { id: "ocean", name: "Ocean", color: "#2B8FD0" },
  { id: "rose", name: "Rose", color: "#D2577E" },
];

export const WALLPAPERS: { id: WallpaperId; name: string }[] = [
  { id: "botanical", name: "Botanical" },
  { id: "aurora", name: "Aurora" },
  { id: "marble", name: "Marble" },
  { id: "sunset", name: "Sunset" },
  { id: "midnight-glow", name: "Midnight glow" },
  { id: "linen", name: "Linen" },
  { id: "waves", name: "Waves" },
  { id: "indigo-mesh", name: "Indigo mesh" },
  { id: "rose-silk", name: "Rose silk" },
  { id: "minimal", name: "Minimal" },
];

export const DEFAULT_APPEARANCE: Appearance = { design: "verdant", accent: null, wallpaper: "botanical", bubbles: "rounded" };

const CACHE_KEY = "appearance";

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.design = a.design;
  if (a.accent) root.dataset.accent = a.accent;
  else delete root.dataset.accent;
  root.dataset.bubbles = a.bubbles;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // Storage may be unavailable; the attributes above still apply.
  }
}

export function cachedAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const a = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) } as Appearance;
      if (DESIGNS.some((d) => d.id === a.design) && WALLPAPERS.some((w) => w.id === a.wallpaper)) return a;
    }
  } catch {
    // fall through
  }
  return DEFAULT_APPEARANCE;
}
