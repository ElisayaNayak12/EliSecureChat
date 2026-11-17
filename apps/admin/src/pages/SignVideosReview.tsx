import { useEffect, useState } from "react";
import { API_URL, api } from "../api";
import type { SignVideo } from "../types";

/**
 * Admin review of contributed human signing videos (spec 5.6). Only VERIFIED videos are ever
 * shown to users during calls, and only for an exact sentence match.
 */
export default function SignVideosReview({ adminToken }: { adminToken: string }) {
  const [videos, setVideos] = useState<SignVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"ALL" | SignVideo["verificationStatus"]>("UNVERIFIED");

  const load = () =>
    api
      .adminListSignVideos(adminToken)
      .then((v) => {
        setVideos(v.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setError(null);
      })
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    void load();
  }, [adminToken]);

  const review = async (id: string, status: SignVideo["verificationStatus"]) => {
    setBusy(id);
    try {
      await api.adminReviewSignVideo(adminToken, id, status, notes[id]);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await api.adminDeleteSignVideo(adminToken, id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = videos.filter((v) => filter === "ALL" || v.verificationStatus === filter);
  const count = (s: SignVideo["verificationStatus"]) => videos.filter((v) => v.verificationStatus === s).length;

  return (
    <div className="sv-review animate-slide-up">
      <div className="sv-filters" role="tablist">
        {(["UNVERIFIED", "VERIFIED", "REJECTED", "ALL"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`sv-filter ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f === "ALL" ? `All (${videos.length})` : `${f.charAt(0)}${f.slice(1).toLowerCase()} (${count(f)})`}
          </button>
        ))}
      </div>
      {error && <div className="auth-status-banner is-error">{error}</div>}
      {shown.length === 0 && (
        <div className="admin-table-wrapper">
          <div className="empty-state-box"><p>No {filter === "ALL" ? "" : filter.toLowerCase()} signing videos.</p></div>
        </div>
      )}
      <div className="sv-grid">
        {shown.map((v) => (
          <article key={v.id} className="sv-card">
            <video src={`${API_URL}/sign-videos/${v.id}/file?adminToken=${encodeURIComponent(adminToken)}`} controls muted playsInline preload="metadata" />
            <div className="sv-body">
              <div className="sv-head">
                <strong>“{v.phraseText}”</strong>
                <span className={`status-badge ${v.verificationStatus === "VERIFIED" ? "approved" : v.verificationStatus === "REJECTED" ? "rejected" : "pending"}`}>
                  {v.verificationStatus.toLowerCase()}
                </span>
              </div>
              <dl>
                <dt>Language</dt><dd>{v.signLanguageId.toUpperCase()} · {v.unit.toLowerCase()}</dd>
                <dt>Gloss</dt><dd>{v.gloss}</dd>
                <dt>Meaning</dt><dd>{v.meaning}</dd>
                <dt>Signer</dt><dd>{v.signerId}{v.region ? ` · ${v.region}` : ""} · {v.quality.toLowerCase()} quality</dd>
                <dt>Licence</dt><dd>{v.license}</dd>
                <dt>Provenance</dt><dd>{v.provenance}</dd>
                <dt>Consent</dt><dd>{v.consentConfirmed ? "Confirmed by uploader" : "Not confirmed"}</dd>
                <dt>SHA-256</dt><dd className="sv-mono">{v.sha256.slice(0, 20)}…</dd>
              </dl>
              <input
                className="sv-note"
                placeholder="Review note (e.g. checked by ISL expert)"
                value={notes[v.id] ?? v.reviewNote ?? ""}
                onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })}
              />
              <div className="admin-action-cell">
                {v.verificationStatus !== "VERIFIED" && (
                  <button className="btn btn-success btn-xs" disabled={busy === v.id} onClick={() => void review(v.id, "VERIFIED")}>Verify</button>
                )}
                {v.verificationStatus !== "REJECTED" && (
                  <button className="btn btn-warning btn-xs" disabled={busy === v.id} onClick={() => void review(v.id, "REJECTED")}>Reject</button>
                )}
                <button className="btn btn-danger btn-xs" disabled={busy === v.id} onClick={() => void remove(v.id)}>Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
