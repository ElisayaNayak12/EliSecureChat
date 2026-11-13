import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { DatasetSample, DatasetStats, RawFrame, VocabularyEntry } from "../types";

/** MediaPipe hand topology (21 points). */
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Plays a recorded sample's landmarks as an animated skeleton, so reviewers can check quality without any video. */
function SkeletonPreview({ frames }: { frames: RawFrame[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || frames.length === 0) return;
    let i = 0;
    const timer = window.setInterval(() => {
      const f = frames[i % frames.length];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const h of f.hands) {
        const pt = (k: number) => [(1 - h.p[k * 3]) * canvas.width, h.p[k * 3 + 1] * canvas.height] as const; // mirrored like a selfie
        ctx.strokeStyle = h.h === "L" ? "#E8C26A" : "#BFD4A7";
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(...pt(a));
          ctx.lineTo(...pt(b));
          ctx.stroke();
        }
      }
      i++;
    }, 50);
    return () => window.clearInterval(timer);
  }, [frames]);
  return <canvas ref={ref} width={240} height={180} className="ds-preview" aria-label="Animated hand landmarks" />;
}

export default function DatasetAdmin({ adminToken }: { adminToken: string }) {
  const [language] = useState("isl");
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [vocab, setVocab] = useState<VocabularyEntry[]>([]);
  const [samples, setSamples] = useState<DatasetSample[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [preview, setPreview] = useState<{ id: string; frames: RawFrame[] } | null>(null);
  const [newWord, setNewWord] = useState({ gloss: "", meaning: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, v, all] = await Promise.all([api.datasetStats(language), api.datasetVocabulary(language), api.adminDatasetSamples(adminToken)]);
    setStats(s);
    setVocab(v);
    setSamples(all);
  };
  useEffect(() => {
    load().catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, [adminToken]);

  const err = (e: unknown) => {
    const t = (e as Error).message;
    try {
      const b = JSON.parse(t);
      return Array.isArray(b.issues) ? b.issues.join(" ") : b.message ?? t;
    } catch {
      return t;
    }
  };

  const review = async (id: string, status: DatasetSample["status"]) => {
    try {
      await api.adminReviewDatasetSample(adminToken, id, status);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const approveAllShown = async () => {
    setBusy(true);
    try {
      for (const s of shown.filter((x) => x.status === "PENDING")) await api.adminReviewDatasetSample(adminToken, s.id, "APPROVED");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.adminDeleteDatasetSample(adminToken, id);
      if (preview?.id === id) setPreview(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const showPreview = async (id: string) => {
    try {
      setPreview({ id, frames: await api.adminDatasetFrames(adminToken, id) });
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const addWord = async () => {
    try {
      await api.adminAddVocabulary(adminToken, { language, ...newWord });
      setNewWord({ gloss: "", meaning: "" });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const removeWord = async (id: string) => {
    try {
      await api.adminRemoveVocabulary(adminToken, id);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const exportDataset = async () => {
    setBusy(true);
    try {
      const data = await api.adminExportDataset(adminToken, language);
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `signconnect-${language}-dataset-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ ok: true, text: `Exported ${data.samples.length} approved samples from ${data.signers.length} signers. Train with: ai/.venv/Scripts/python -m signconnect_ai.train --data <file> --out runs/<name>` });
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    } finally {
      setBusy(false);
    }
  };

  const shown = samples.filter((s) => filter === "ALL" || s.status === filter);
  const ready = stats?.glosses.filter((g) => g.approved >= 3).length ?? 0;

  return (
    <div className="ds-admin animate-slide-up">
      {msg && <div className={`auth-status-banner ${msg.ok ? "is-info" : "is-error"}`}>{msg.text}</div>}

      {stats && (
        <div className="admin-stats-grid">
          {[
            ["Signers", stats.totals.signers],
            ["Active consents", stats.totals.consents],
            ["Approved samples", stats.totals.approved],
            ["Awaiting review", stats.totals.pending],
            ["Words with 3+ approved", `${ready}/${stats.glosses.length}`],
          ].map(([label, value]) => (
            <div key={label as string} className="admin-stat-card">
              <strong className="stat-value">{value}</strong>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ds-admin-row">
        <section className="admin-table-wrapper ds-panel">
          <div className="ds-panel-head">
            <h3>Review recordings</h3>
            <div className="sv-filters">
              {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((f) => (
                <button key={f} className={`sv-filter ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f.charAt(0) + f.slice(1).toLowerCase()} ({f === "ALL" ? samples.length : samples.filter((s) => s.status === f).length})
                </button>
              ))}
            </div>
          </div>
          {filter === "PENDING" && shown.length > 0 && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void approveAllShown()}>Approve all pending</button>
          )}
          {shown.length === 0 ? (
            <div className="empty-state-box"><p>No {filter === "ALL" ? "" : filter.toLowerCase()} recordings.</p></div>
          ) : (
            <table className="admin-data-table">
              <thead><tr><th>Word</th><th>Signer</th><th>Frames</th><th>Hands seen</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {shown.slice(0, 200).map((s) => (
                  <tr key={s.id} className={preview?.id === s.id ? "ds-selected" : ""}>
                    <td><strong>{s.gloss}</strong></td>
                    <td><code>{s.signerId}</code></td>
                    <td>{s.frameCount} · {(s.durationMs / 1000).toFixed(1)}s</td>
                    <td>{Math.round(s.handFrameRatio * 100)}%</td>
                    <td><span className={`status-badge ${s.status === "APPROVED" ? "approved" : s.status === "REJECTED" ? "rejected" : "pending"}`}>{s.status.toLowerCase()}</span></td>
                    <td>
                      <div className="admin-action-cell">
                        <button className="btn btn-secondary btn-xs" onClick={() => void showPreview(s.id)}>Preview</button>
                        {s.status !== "APPROVED" && <button className="btn btn-success btn-xs" onClick={() => void review(s.id, "APPROVED")}>Approve</button>}
                        {s.status !== "REJECTED" && <button className="btn btn-warning btn-xs" onClick={() => void review(s.id, "REJECTED")}>Reject</button>}
                        <button className="btn btn-danger btn-xs" onClick={() => void remove(s.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="ds-side">
          <section className="admin-table-wrapper ds-panel">
            <h3>Preview</h3>
            {preview ? (
              <>
                <SkeletonPreview frames={preview.frames} />
                <p className="ds-hint">{samples.find((s) => s.id === preview.id)?.gloss} · landmarks only, no video exists</p>
              </>
            ) : (
              <p className="ds-hint">Choose “Preview” to replay a recording's hand landmarks.</p>
            )}
          </section>

          <section className="admin-table-wrapper ds-panel">
            <h3>Export for training</h3>
            <p className="ds-hint">Approved samples with active consent, pseudonymous signer ids only.</p>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void exportDataset()}>Download dataset JSON</button>
          </section>
        </aside>
      </div>

      <section className="admin-table-wrapper ds-panel">
        <div className="ds-panel-head">
          <h3>Vocabulary ({vocab.length} words)</h3>
          <div className="ds-add">
            <input className="sv-note" placeholder="GLOSS" value={newWord.gloss} onChange={(e) => setNewWord({ ...newWord, gloss: e.target.value })} />
            <input className="sv-note" placeholder="English meaning" value={newWord.meaning} onChange={(e) => setNewWord({ ...newWord, meaning: e.target.value })} />
            <button className="btn btn-secondary btn-sm" onClick={() => void addWord()}>Add word</button>
          </div>
        </div>
        <div className="ds-vocab">
          {vocab.map((v) => {
            const g = stats?.glosses.find((x) => x.gloss === v.gloss);
            return (
              <div key={v.id} className={`ds-vocab-item ${g && g.approved >= 3 ? "ready" : ""}`}>
                <strong>{v.gloss}</strong>
                <span>“{v.meaning}” · {g?.approved ?? 0} approved / {g?.pending ?? 0} pending · {g?.signers ?? 0} signers</span>
                <button className="btn btn-ghost btn-xs" onClick={() => void removeWord(v.id)} title="Only possible when the word has no recordings">Remove</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
