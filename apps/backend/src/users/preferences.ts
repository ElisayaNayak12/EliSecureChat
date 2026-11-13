/**
 * User language, accessibility and voice preferences (spec section 7, "User profiles").
 *
 * Validation lives here rather than in a class-validator DTO on purpose: the dev
 * server runs under tsx, which does not emit decorator metadata, so Nest's
 * ValidationPipe cannot see DTO types in dev. This function validates in every mode.
 */
import { findSignLanguage, isSpokenLanguage } from "../languages/language-packs";

export const TEXT_SIZES = ["default", "large", "x-large"] as const;
export const THEMES = ["system", "light", "dark"] as const;
/** The 5 app designs users can switch between (Settings > Appearance). */
export const DESIGNS = ["verdant", "indigo", "emerald", "ocean", "midnight"] as const;
export const ACCENTS = ["leaf", "indigo", "clay", "ocean", "rose"] as const;
export const WALLPAPERS = ["botanical", "aurora", "marble", "sunset", "midnight-glow", "linen", "waves", "indigo-mesh", "rose-silk", "minimal"] as const;
export const BUBBLES = ["rounded", "compact"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];
export type ThemePreference = (typeof THEMES)[number];

export type UserPreferences = {
  preferredLanguage: string; // spoken/written language id, e.g. "en-IN"
  preferredSignLanguage: string | null; // sign-language pack id, e.g. "isl"; null = none
  accessibility: {
    textSize: TextSize;
    highContrast: boolean;
    reduceMotion: boolean;
    visualAlerts: boolean;
  };
  voice: {
    /** Name of a device-local speech voice; null = system default. */
    voiceName: string | null;
    speakingRate: number; // 0.5 - 2.0
  };
  theme: ThemePreference;
  appearance: {
    design: (typeof DESIGNS)[number];
    /** null = the design's own accent colour. */
    accent: (typeof ACCENTS)[number] | null;
    wallpaper: (typeof WALLPAPERS)[number];
    bubbles: (typeof BUBBLES)[number];
  };
  updatedAt: string | null;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  preferredLanguage: "en-IN",
  preferredSignLanguage: null,
  accessibility: { textSize: "default", highContrast: false, reduceMotion: false, visualAlerts: false },
  voice: { voiceName: null, speakingRate: 1 },
  /** "system" = no explicit choice; clients keep their local/device theme. */
  theme: "system",
  appearance: { design: "verdant", accent: null, wallpaper: "botanical", bubbles: "rounded" },
  updatedAt: null,
};

export class PreferencesValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fill any missing fields (older stored records) with defaults. */
export function resolvePreferences(stored: Partial<UserPreferences> | undefined): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    accessibility: { ...DEFAULT_PREFERENCES.accessibility, ...(stored?.accessibility ?? {}) },
    voice: { ...DEFAULT_PREFERENCES.voice, ...(stored?.voice ?? {}) },
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...(stored?.appearance ?? {}) },
  };
}

/**
 * Validate a partial update and merge it onto the current preferences.
 * Unknown keys are rejected rather than silently dropped.
 */
export function applyPreferencesPatch(current: UserPreferences, patch: unknown, now = new Date()): UserPreferences {
  if (!isPlainObject(patch)) throw new PreferencesValidationError(["Body must be a JSON object."]);

  const issues: string[] = [];
  const next: UserPreferences = resolvePreferences(current);
  const allowed = new Set(["preferredLanguage", "preferredSignLanguage", "accessibility", "voice", "theme", "appearance"]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) issues.push(`Unknown field "${key}".`);
  }

  if ("preferredLanguage" in patch) {
    const v = patch.preferredLanguage;
    if (typeof v !== "string" || !isSpokenLanguage(v)) issues.push(`preferredLanguage "${String(v)}" is not a supported language.`);
    else next.preferredLanguage = v;
  }

  if ("preferredSignLanguage" in patch) {
    const v = patch.preferredSignLanguage;
    if (v === null) next.preferredSignLanguage = null;
    else if (typeof v !== "string" || !findSignLanguage(v)) issues.push(`preferredSignLanguage "${String(v)}" is not a known sign-language pack.`);
    else next.preferredSignLanguage = v;
  }

  if ("theme" in patch) {
    const v = patch.theme;
    if (!THEMES.includes(v as ThemePreference)) issues.push(`theme must be one of ${THEMES.join(", ")}.`);
    else next.theme = v as ThemePreference;
  }

  if ("appearance" in patch) {
    const a = patch.appearance;
    if (!isPlainObject(a)) issues.push("appearance must be an object.");
    else {
      for (const key of Object.keys(a)) {
        if (!(key in DEFAULT_PREFERENCES.appearance)) issues.push(`Unknown field "appearance.${key}".`);
      }
      const pick = <T extends readonly string[]>(key: "design" | "wallpaper" | "bubbles", list: T) => {
        if (!(key in a)) return;
        if (!list.includes(a[key] as string)) issues.push(`appearance.${key} must be one of ${list.join(", ")}.`);
        else (next.appearance as Record<string, unknown>)[key] = a[key];
      };
      pick("design", DESIGNS);
      pick("wallpaper", WALLPAPERS);
      pick("bubbles", BUBBLES);
      if ("accent" in a) {
        if (a.accent !== null && !ACCENTS.includes(a.accent as (typeof ACCENTS)[number])) issues.push(`appearance.accent must be null or one of ${ACCENTS.join(", ")}.`);
        else next.appearance.accent = a.accent as UserPreferences["appearance"]["accent"];
      }
    }
  }

  if ("accessibility" in patch) {
    const a = patch.accessibility;
    if (!isPlainObject(a)) issues.push("accessibility must be an object.");
    else {
      for (const key of Object.keys(a)) {
        if (!(key in DEFAULT_PREFERENCES.accessibility)) issues.push(`Unknown field "accessibility.${key}".`);
      }
      if ("textSize" in a) {
        if (!TEXT_SIZES.includes(a.textSize as TextSize)) issues.push(`accessibility.textSize must be one of ${TEXT_SIZES.join(", ")}.`);
        else next.accessibility.textSize = a.textSize as TextSize;
      }
      for (const flag of ["highContrast", "reduceMotion", "visualAlerts"] as const) {
        if (flag in a) {
          if (typeof a[flag] !== "boolean") issues.push(`accessibility.${flag} must be true or false.`);
          else next.accessibility[flag] = a[flag] as boolean;
        }
      }
    }
  }

  if ("voice" in patch) {
    const v = patch.voice;
    if (!isPlainObject(v)) issues.push("voice must be an object.");
    else {
      for (const key of Object.keys(v)) {
        if (!(key in DEFAULT_PREFERENCES.voice)) issues.push(`Unknown field "voice.${key}".`);
      }
      if ("voiceName" in v) {
        const name = v.voiceName;
        if (name !== null && (typeof name !== "string" || name.length === 0 || name.length > 200)) {
          issues.push("voice.voiceName must be null or a string of 1-200 characters.");
        } else next.voice.voiceName = name as string | null;
      }
      if ("speakingRate" in v) {
        const r = v.speakingRate;
        if (typeof r !== "number" || !Number.isFinite(r) || r < 0.5 || r > 2) issues.push("voice.speakingRate must be a number from 0.5 to 2.");
        else next.voice.speakingRate = Math.round(r * 100) / 100;
      }
    }
  }

  if (issues.length) throw new PreferencesValidationError(issues);
  next.updatedAt = now.toISOString();
  return next;
}
