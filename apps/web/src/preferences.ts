/**
 * Applies accessibility preferences app-wide (SignConnect Phase 1a) and wraps the
 * device's built-in speech voices for the voice preference.
 *
 * Preferences are mirrored to localStorage only as a render cache, so text size and
 * contrast apply before the first network round-trip. The backend is the source of truth.
 */
import type { UserPreferences } from "./types";

const CACHE_KEY = "a11y-prefs";

export function applyAccessibility(prefs: Pick<UserPreferences, "accessibility"> | null) {
  const root = document.documentElement;
  const a = prefs?.accessibility;
  root.dataset.textSize = a?.textSize ?? "default";
  root.dataset.contrast = a?.highContrast ? "high" : "normal";
  root.dataset.motion = a?.reduceMotion ? "reduce" : "normal";
  root.dataset.visualAlerts = a?.visualAlerts ? "on" : "off";
  try {
    if (prefs) localStorage.setItem(CACHE_KEY, JSON.stringify(prefs.accessibility));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the attributes above still apply.
  }
}

/** Re-apply the cached accessibility settings at startup, before sign-in completes. */
export function applyCachedAccessibility() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) applyAccessibility({ accessibility: JSON.parse(raw) });
  } catch {
    applyAccessibility(null);
  }
}

/** Brief full-screen flash for users who rely on visual rather than audible alerts. */
export function flashVisualAlert() {
  const root = document.documentElement;
  if (root.dataset.visualAlerts !== "on") return;
  root.classList.remove("visual-alert-flash");
  void root.offsetWidth; // restart the animation if alerts arrive back to back
  root.classList.add("visual-alert-flash");
  window.setTimeout(() => root.classList.remove("visual-alert-flash"), 900);
}

/* ---- device voices ---------------------------------------------------- */

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Voices that the browser reports as running on this device (localService),
 * matching the spec's local-inference rule. Network voices are excluded.
 */
export function listLocalVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.localService);
}

/** Voices load asynchronously in most browsers; resolve once they are available. */
export function whenVoicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = listLocalVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(listLocalVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    window.setTimeout(done, timeoutMs);
  });
}

/** Speaks text with the user's voice preference; queued (not interrupting) so incoming lines are not lost. */
export function speakText(text: string, voiceName: string | null, rate: number, lang: string) {
  if (!speechSupported()) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = lang;
  const voice = voiceName ? listLocalVoices().find((v) => v.name === voiceName) : listLocalVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function previewVoice(text: string, voiceName: string | null, rate: number, lang: string) {
  if (!speechSupported()) throw new Error("This browser has no speech engine.");
  const synth = window.speechSynthesis;
  synth.cancel(); // interruptible playback
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = lang;
  const voice = voiceName ? listLocalVoices().find((v) => v.name === voiceName) : undefined;
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
