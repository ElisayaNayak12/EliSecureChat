import { useEffect, useState } from "react";
import { api } from "../api";
import type { SignModel } from "../types";

/** Upload, publish, roll back and withdraw trained sign-recognition models (output of ai/signconnect_ai/train.py). */
export default function ModelsAdmin({ adminToken }: { adminToken: string }) {
  const [models, setModels] = useState<SignModel[]>([]);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.adminModels(adminToken).then(setModels).catch((e: Error) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    void load();
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

  const upload = async () => {
    if (!modelFile || !manifestFile) {
      setMsg({ ok: false, text: "Choose both model.onnx and manifest.json from the training output folder." });
      return;
    }
    setBusy(true);
    try {
      const m = await api.adminUploadModel(adminToken, modelFile, manifestFile, note);
      setMsg({ ok: true, text: `Published ${m.manifest.language.toUpperCase()} model v${m.manifest.version}. Apps download it the next time sign detection starts.` });
      setModelFile(null);
      setManifestFile(null);
      setNote("");
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: SignModel["status"]) => {
    try {
      await api.adminSetModelStatus(adminToken, id, status);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this model file permanently?")) return;
    try {
      await api.adminDeleteModel(adminToken, id);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    }
  };

  return (
    <div className="ds-admin animate-slide-up">
      {msg && <div className={`auth-status-banner ${msg.ok ? "is-info" : "is-error"}`}>{msg.text}</div>}
      <section className="admin-table-wrapper ds-panel">
        <h3>Publish a trained model</h3>
        <p className="ds-hint">
          Upload <code>model.onnx</code> and <code>manifest.json</code> from a training run. The manifest must include honest held-out metrics.
          Publishing replaces the current model for that language. The previous one is kept, so you can roll back.
        </p>
        <div className="ds-add">
          <label className="btn btn-secondary btn-sm">{modelFile ? modelFile.name : "model.onnx"}<input type="file" accept=".onnx" hidden onChange={(e) => setModelFile(e.target.files?.[0] ?? null)} /></label>
          <label className="btn btn-secondary btn-sm">{manifestFile ? manifestFile.name : "manifest.json"}<input type="file" accept=".json,application/json" hidden onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)} /></label>
          <input className="sv-note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void upload()}>Upload & publish</button>
        </div>
      </section>

      <section className="admin-table-wrapper ds-panel">
        <h3>Models</h3>
        {models.length === 0 ? (
          <div className="empty-state-box"><p>No trained models yet.</p></div>
        ) : (
          <table className="admin-data-table">
            <thead><tr><th>Language</th><th>Version</th><th>Signs</th><th>Test accuracy</th><th>Data</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>{m.manifest.language.toUpperCase()}</td>
                  <td><strong>v{m.manifest.version}</strong><div className="ds-hint">{m.manifest.architecture} · {(m.sizeBytes / 1024).toFixed(0)} KB</div></td>
                  <td>{m.manifest.labels.length}</td>
                  <td>
                    {m.manifest.metrics.testAccuracy === null ? "n/a" : `${Math.round(m.manifest.metrics.testAccuracy * 100)}%`}
                    <div className="ds-hint">{m.manifest.metrics.signerIndependent ? "signer-independent" : "NOT signer-independent"}</div>
                  </td>
                  <td>{m.manifest.metrics.trainSamples} train / {m.manifest.metrics.testSamples} test · {m.manifest.metrics.signers} signers</td>
                  <td><span className={`status-badge ${m.status === "PUBLISHED" ? "approved" : "pending"}`}>{m.status.toLowerCase()}</span></td>
                  <td>
                    <div className="admin-action-cell">
                      {m.status === "PUBLISHED" ? (
                        <button className="btn btn-warning btn-xs" onClick={() => void setStatus(m.id, "WITHDRAWN")}>Withdraw</button>
                      ) : (
                        <button className="btn btn-success btn-xs" onClick={() => void setStatus(m.id, "PUBLISHED")}>Publish</button>
                      )}
                      <button className="btn btn-danger btn-xs" onClick={() => void remove(m.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
