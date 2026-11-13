import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { InfoIcon } from "../components/Icons";
import { previewVoice, speechSupported, whenVoicesReady } from "../preferences";
import type { PreferencesPatch, SignLanguagePack, SpokenLanguage, TextSize, UserPreferences } from "../types";

interface Props {
  preferences: UserPreferences | null;
  onUpdatePreferences: (patch: PreferencesPatch) => Promise<void>;
  backendReady: boolean;
}

const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
  { id: "x-large", label: "Extra large" },
];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pref-switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="pref-switch-thumb" />
    </button>
  );
}

function packStatus(pack: SignLanguagePack) {
  return pack.lifecycle === "IN_DEVELOPMENT"
    ? { label: `In development · Phase ${pack.roadmapPhase}`, tone: "dev" }
    : { label: `Planned · Phase ${pack.roadmapPhase}`, tone: "planned" };
}

export default function LanguageAccessibilitySettings({ preferences, onUpdatePreferences, backendReady }: Props) {
  const [signLanguages, setSignLanguages] = useState<SignLanguagePack[]>([]);
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenLanguage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [rate, setRate] = useState(preferences?.voice.speakingRate ?? 1);
  const rateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([api.listSignLanguages(), api.listSpokenLanguages()])
      .then(([sign, spoken]) => {
        if (!alive) return;
        setSignLanguages(sign);
        setSpokenLanguages(spoken);
        setLoadError(null);
      })
      .catch((err: Error) => alive && setLoadError(`Could not load languages: ${err.message}`));
    void whenVoicesReady().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
      window.clearTimeout(rateTimer.current);
    };
  }, [backendReady]);

  useEffect(() => {
    if (preferences) setRate(preferences.voice.speakingRate);
  }, [preferences?.voice.speakingRate]);

  const save = async (patch: PreferencesPatch) => {
    setSaveError(null);
    try {
      await onUpdatePreferences(patch);
    } catch (err) {
      setSaveError(`Not saved: ${(err as Error).message}`);
    }
  };

  const onRateChange = (value: number) => {
    setRate(value);
    window.clearTimeout(rateTimer.current);
    rateTimer.current = window.setTimeout(() => void save({ voice: { speakingRate: value } }), 400);
  };

  if (!preferences) {
    return (
      <div className="settings-section">
        <h3>Language &amp; accessibility</h3>
        <div className="settings-card pref-loading">{backendReady ? "Loading your preferences…" : "Connect to the server to load your preferences."}</div>
      </div>
    );
  }

  const a = preferences.accessibility;
  const disabled = !backendReady;
  const spokenName = spokenLanguages.find((l) => l.id === preferences.preferredLanguage)?.name ?? preferences.preferredLanguage;

  return (
    <>
      {saveError && (
        <div className="pref-error" role="alert">
          {saveError}
          <button className="btn btn-ghost btn-xs" onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}

      {/* Language */}
      <div className="settings-section">
        <h3>Language</h3>
        <div className="settings-card">
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>Spoken &amp; written language</strong>
              <span>Used for captions, translated text and voice.</span>
            </div>
            <select
              className="pref-select"
              aria-label="Spoken and written language"
              value={preferences.preferredLanguage}
              disabled={disabled || spokenLanguages.length === 0}
              onChange={(e) => void save({ preferredLanguage: e.target.value })}
            >
              {spokenLanguages.length === 0 && <option value={preferences.preferredLanguage}>{spokenName}</option>}
              {spokenLanguages.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sign language */}
      <div className="settings-section">
        <h3>Sign language</h3>
        <div className="settings-card">
          {loadError && <p className="pref-error-inline">{loadError}</p>}
          <div className="sign-pack-list" role="radiogroup" aria-label="Preferred sign language">
            <button
              type="button"
              role="radio"
              aria-checked={preferences.preferredSignLanguage === null}
              className={`sign-pack ${preferences.preferredSignLanguage === null ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => void save({ preferredSignLanguage: null })}
            >
              <span className="sign-pack-code muted">—</span>
              <span className="sign-pack-text">
                <strong>None</strong>
                <span>I don't use a sign language</span>
              </span>
            </button>
            {signLanguages.map((pack) => {
              const status = packStatus(pack);
              const selected = preferences.preferredSignLanguage === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`sign-pack ${selected ? "selected" : ""}`}
                  disabled={disabled}
                  onClick={() => void save({ preferredSignLanguage: pack.id })}
                >
                  <span className="sign-pack-code">{pack.code}</span>
                  <span className="sign-pack-text">
                    <strong>{pack.name}</strong>
                    <span>{pack.region}</span>
                    <span className={`sign-pack-status ${status.tone}`}>{status.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="settings-info-item pref-honest-note">
            <InfoIcon size={16} />
            <span>
              {(() => {
                const pack = signLanguages.find((p) => p.id === preferences.preferredSignLanguage);
                if (!pack) return "Choose the sign language you use. Built-in hand gestures work in calls for everyone.";
                const model = pack.recognitionModel ? `a trained ${pack.code} model (v${pack.recognitionModel.version}, ${pack.vocabulary.glossCount} signs)` : `no trained ${pack.code} model yet`;
                const videos = pack.videoLibrary.verifiedClipCount ? `${pack.videoLibrary.verifiedClipCount} verified signing videos` : "no verified signing videos yet";
                return `In calls, built-in gestures and your personal signs are recognised. ${pack.name} currently has ${model} and ${videos}.`;
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* Accessibility */}
      <div className="settings-section">
        <h3>Accessibility</h3>
        <div className="settings-card pref-rows">
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>Text size</strong>
              <span>Larger text for messages, chat lists and settings.</span>
            </div>
            <div className="pref-segmented" role="radiogroup" aria-label="Text size">
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={a.textSize === t.id}
                  className={a.textSize === t.id ? "active" : ""}
                  disabled={disabled}
                  onClick={() => void save({ accessibility: { textSize: t.id } })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>High contrast</strong>
              <span>Solid surfaces, stronger text and borders.</span>
            </div>
            <Switch label="High contrast" checked={a.highContrast} disabled={disabled} onChange={(v) => void save({ accessibility: { highContrast: v } })} />
          </div>
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>Reduce motion</strong>
              <span>Turn off animations and moving effects.</span>
            </div>
            <Switch label="Reduce motion" checked={a.reduceMotion} disabled={disabled} onChange={(v) => void save({ accessibility: { reduceMotion: v } })} />
          </div>
          <div className="setting-row">
            <div className="setting-label-col">
              <strong>Visual alerts</strong>
              <span>Flash the screen when a message or call arrives.</span>
            </div>
            <Switch label="Visual alerts" checked={a.visualAlerts} disabled={disabled} onChange={(v) => void save({ accessibility: { visualAlerts: v } })} />
          </div>
        </div>
      </div>

      {/* Voice */}
      <div className="settings-section">
        <h3>Voice</h3>
        <div className="settings-card pref-rows">
          {!speechSupported() || voices.length === 0 ? (
            <div className="settings-info-item">
              <InfoIcon size={16} />
              <span>No on-device voices were found in this browser, so voice playback is unavailable here.</span>
            </div>
          ) : (
            <>
              <div className="setting-row">
                <div className="setting-label-col">
                  <strong>Voice</strong>
                  <span>Voices installed on this device. Network voices are not used.</span>
                </div>
                <select
                  className="pref-select"
                  aria-label="Voice"
                  value={preferences.voice.voiceName ?? ""}
                  disabled={disabled}
                  onChange={(e) => void save({ voice: { voiceName: e.target.value || null } })}
                >
                  <option value="">System default</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <div className="setting-label-col">
                  <strong>Speaking speed</strong>
                  <span>{rate.toFixed(2)}×</span>
                </div>
                <div className="pref-rate">
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={rate}
                    aria-label="Speaking speed"
                    disabled={disabled}
                    onChange={(e) => onRateChange(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      try {
                        previewVoice("This is how your messages will sound.", preferences.voice.voiceName, rate, preferences.preferredLanguage);
                      } catch (err) {
                        setSaveError((err as Error).message);
                      }
                    }}
                  >
                    Play sample
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
