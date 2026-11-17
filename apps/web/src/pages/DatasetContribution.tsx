import { useEffect, useState } from "react";
import { api } from "../api";
import type { RawHand } from "../ai/signFeatures";
import type { DatasetConsent, DatasetSample, DatasetStats, User } from "../types";

export type CapturedSign = { frames: { t: number; hands: RawHand[] }[]; handFrames: number };

type Props = {
  currentUser: User;
  language: string;
  languageName: string;
  cameraReady: boolean;
  busy: boolean;
  /** Countdown + capture one sign from the shared camera; resolves with raw landmarks (never video). */
  captureSign: () => Promise<CapturedSign | null>;
};

const SAMPLES_TARGET = 10;

/**
 * Consent-based dataset collection (spec section 6): consent first, then labelled recordings of
 * MediaPipe hand landmarks for a fixed vocabulary. Admins review samples before they can be used for training.
 */
export default function DatasetContribution({ currentUser, language, languageName, cameraReady, busy, captureSign }: Props) {
  const [consents, setConsents] = useState<DatasetConsent[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [mine, setMine] = useState<DatasetSample[]>([]);
  const [consentId, setConsentId] = useState("");
  const [gloss, setGloss] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ signerName: "", region: "", deaf: false, agreeRecording: false, agreeTraining: false });
  const [showForm, setShowForm] = useState(false);
  const [recording, setRecording] = useState(false);

  const active = consents.filter((c) => c.language === language && !c.revokedAt);

  const reload = async () => {
    const [c, s, m] = await Promise.all([api.listDatasetConsents(currentUser.id), api.datasetStats(language), api.listMyDatasetSamples(currentUser.id)]);
    setConsents(c);
    setStats(s);
    setMine(m.filter((x) => x.language === language).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    const act = c.filter((x) => x.language === language && !x.revokedAt);
    setConsentId((cur) => (act.some((x) => x.id === cur) ? cur : act[0]?.id ?? ""));
    setGloss((cur) => cur || s.glosses[0]?.gloss || "");
  };

  useEffect(() => {
    reload().catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, [language, currentUser.id]);

  const issuesOf = (err: unknown) => {
    const text = (err as Error).message;
    try {
      const body = JSON.parse(text);
      if (Array.isArray(body.issues)) return body.issues.join(" ");
      if (body.message) return String(body.message);
    } catch {
      /* plain text */
    }
    return text;
  };

  const giveConsent = async () => {
    try {
      const c = await api.createDatasetConsent({
        userId: currentUser.id, signerName: form.signerName, region: form.region || undefined, language,
        isDeafOrNativeSigner: form.deaf, agreeRecording: form.agreeRecording, agreeTraining: form.agreeTraining,
      });
      setShowForm(false);
      setForm({ signerName: "", region: "", deaf: false, agreeRecording: false, agreeTraining: false });
      setMsg({ ok: true, text: `Consent recorded. This signer appears in the dataset only as ${c.signerId}.` });
      await reload();
      setConsentId(c.id);
    } catch (err) {
      setMsg({ ok: false, text: issuesOf(err) });
    }
  };

  const revoke = async (c: DatasetConsent) => {
    if (!window.confirm(`Withdraw consent for ${c.signerName}? All of their recorded samples will be permanently deleted.`)) return;
    try {
      const r = await api.revokeDatasetConsent(c.id, currentUser.id);
      setMsg({ ok: true, text: `Consent withdrawn; ${r.deletedSamples} sample(s) deleted.` });
      await reload();
    } catch (err) {
      setMsg({ ok: false, text: issuesOf(err) });
    }
  };

  const record = async () => {
    if (!consentId || !gloss) return;
    setMsg(null);
    setRecording(true);
    try {
      const captured = await captureSign();
      if (!captured) return;
      if (captured.handFrames < 8) {
        setMsg({ ok: false, text: "No clear hands were seen. Make sure your hands are in frame and well lit, then try again." });
        return;
      }
      await api.addDatasetSample({ userId: currentUser.id, consentId, gloss, language, frames: captured.frames });
      setMsg({ ok: true, text: `Saved a ${gloss} sample (${captured.frames.length} frames of hand landmarks). It will be reviewed before training.` });
      await reload();
    } catch (err) {
      setMsg({ ok: false, text: issuesOf(err) });
    } finally {
      setRecording(false);
    }
  };

  const removeSample = async (id: string) => {
    try {
      await api.deleteMyDatasetSample(id, currentUser.id);
      await reload();
    } catch (err) {
      setMsg({ ok: false, text: issuesOf(err) });
    }
  };

  const mineByGloss = (g: string) => mine.filter((s) => s.gloss === g && s.status !== "REJECTED").length;

  return (
    <section className="ts-card ts-wide">
      <h3>Contribute to the {languageName} dataset</h3>
      <p className="ts-footnote">
        This is how a real {languageName} recognition model gets built: native signers record each word several times, an admin reviews the
        recordings, and the model is trained on them (ai/signconnect_ai). Only hand landmarks are stored, never video. Each signer is stored
        under a pseudonymous id. Withdrawing consent deletes their recordings.
      </p>

      {stats && (
        <div className="ds-totals">
          <span><strong>{stats.totals.signers}</strong> signers</span>
          <span><strong>{stats.totals.approved}</strong> approved</span>
          <span><strong>{stats.totals.pending}</strong> awaiting review</span>
          <span><strong>{stats.glosses.filter((g) => g.approved >= 3).length}</strong>/{stats.glosses.length} words with 3+ approved samples</span>
        </div>
      )}

      <div className="ds-step">
        <h4>1 · Signer consent</h4>
        {active.length === 0 && !showForm && <p className="ts-footnote">No signer has given consent on this account yet.</p>}
        {active.map((c) => (
          <div key={c.id} className="ds-consent">
            <div>
              <strong>{c.signerName}</strong>
              <span>{c.signerId} · {c.isDeafOrNativeSigner ? "Deaf / native signer" : "signer"}{c.region ? ` · ${c.region}` : ""} · consented {new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => void revoke(c)}>Withdraw consent</button>
          </div>
        ))}
        {!showForm ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>Add a signer</button>
        ) : (
          <div className="ds-form">
            <div className="ts-form-grid">
              <label>Signer's name (kept private)<input value={form.signerName} onChange={(e) => setForm({ ...form, signerName: e.target.value })} maxLength={80} /></label>
              <label>Region<input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Mumbai" maxLength={80} /></label>
            </div>
            <label className="cp-check"><input type="checkbox" checked={form.deaf} onChange={(e) => setForm({ ...form, deaf: e.target.checked })} /> The signer is Deaf or a native {languageName} signer</label>
            <label className="cp-check"><input type="checkbox" checked={form.agreeRecording} onChange={(e) => setForm({ ...form, agreeRecording: e.target.checked })} /> The signer agrees to having their hand movements recorded as landmark data (no video).</label>
            <label className="cp-check"><input type="checkbox" checked={form.agreeTraining} onChange={(e) => setForm({ ...form, agreeTraining: e.target.checked })} /> The signer agrees to the recordings being used to train sign-recognition models, and knows they can withdraw at any time.</label>
            <div className="ts-upload-row">
              <button className="btn btn-primary btn-sm" onClick={() => void giveConsent()}>Record consent</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="ds-step">
        <h4>2 · Record words</h4>
        {active.length === 0 ? (
          <p className="ts-footnote">Add a signer first.</p>
        ) : (
          <>
            <div className="ds-record-row">
              <label>Signer
                <select className="pref-select" value={consentId} onChange={(e) => setConsentId(e.target.value)}>
                  {active.map((c) => <option key={c.id} value={c.id}>{c.signerName}</option>)}
                </select>
              </label>
              <label>Word
                <select className="pref-select" value={gloss} onChange={(e) => setGloss(e.target.value)}>
                  {stats?.glosses.map((g) => (
                    <option key={g.gloss} value={g.gloss}>{g.gloss} · “{g.meaning}” ({mineByGloss(g.gloss)}/{SAMPLES_TARGET})</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" disabled={!cameraReady || busy || recording} onClick={() => void record()}>
                {recording ? "Recording…" : "Record this word"}
              </button>
            </div>
            {!cameraReady && <p className="ts-footnote">Turn on the camera in “Personal signs” above.</p>}
            <p className="ts-footnote">
              Sign the word naturally after the countdown, then lower your hands. Aim for {SAMPLES_TARGET} recordings per word, with small natural variations.
            </p>
          </>
        )}
      </div>

      {msg && <p className={msg.ok ? "ts-msg" : "ts-error"}>{msg.text}</p>}

      {stats && (
        <details className="ds-progress">
          <summary>Vocabulary progress ({stats.glosses.length} words)</summary>
          <div className="ds-progress-grid">
            {stats.glosses.map((g) => (
              <div key={g.gloss} className={`ds-word ${g.approved >= 3 ? "ready" : ""}`}>
                <strong>{g.gloss}</strong>
                <span>{g.approved} approved · {g.pending} pending · {g.signers} signer{g.signers === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {mine.length > 0 && (
        <details className="ds-progress">
          <summary>My recordings ({mine.length})</summary>
          <div className="ds-mine">
            {mine.slice(0, 50).map((s) => (
              <div key={s.id} className="ds-sample">
                <strong>{s.gloss}</strong>
                <span>{s.frameCount} frames · {(s.durationMs / 1000).toFixed(1)} s · hands in {Math.round(s.handFrameRatio * 100)}%</span>
                <span className={`ts-chip ${s.status === "APPROVED" ? "ok" : s.status === "REJECTED" ? "bad" : "warn"}`}>{s.status.toLowerCase()}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => void removeSample(s.id)}>Delete</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
