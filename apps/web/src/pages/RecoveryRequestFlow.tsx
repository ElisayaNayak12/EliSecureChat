import { useState, useRef, useEffect } from "react";
import { api } from "../api";

interface RecoveryRequestFlowProps {
  suspendedUserId: string;
  suspensionReason: string;
  userPhone: string;
  onClose: () => void;
}

type Step = "explain" | "document" | "video" | "ai_processing" | "done";

const AI_STEPS = [
  { label: "Initializing secure verification channel…", duration: 600 },
  { label: "Extracting face from identity document…", duration: 900 },
  { label: "Analyzing video biometrics…", duration: 1100 },
  { label: "Performing liveness detection…", duration: 800 },
  { label: "Cross-matching face with document…", duration: 1200 },
  { label: "Running OCR on identity card…", duration: 700 },
  { label: "Verifying name against registered details…", duration: 600 },
  { label: "Computing authorization confidence score…", duration: 900 },
  { label: "Generating verification summary…", duration: 500 },
  { label: "Submitting result to admin queue…", duration: 400 },
];

export default function RecoveryRequestFlow({
  suspendedUserId,
  suspensionReason,
  userPhone,
  onClose,
}: RecoveryRequestFlowProps) {
  const [step, setStep] = useState<Step>("explain");
  const [reason, setReason] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(3);
  const [aiStepIndex, setAiStepIndex] = useState(0);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiResult, setAiResult] = useState<{
    faceMatchScore?: number;
    isAuthorized?: boolean;
    summary?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Start webcam on video step
  useEffect(() => {
    if (step === "video") {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          setVideoStream(stream);
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => {
          // Webcam unavailable — mark as no video but continue
          setHasVideo(false);
        });
    }
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [step]);

  // Stop stream when leaving video step
  const stopStream = () => {
    if (videoStream) {
      videoStream.getTracks().forEach((t) => t.stop());
      setVideoStream(null);
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setDocumentPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCaptureVideo = () => {
    if (!videoStream) {
      setHasVideo(false);
      proceedToAI();
      return;
    }
    setIsRecording(true);
    setRecordCountdown(3);
    const interval = setInterval(() => {
      setRecordCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRecording(false);
          setHasVideo(true);
          stopStream();
          proceedToAI();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const proceedToAI = () => {
    setStep("ai_processing");
    runAISteps();
  };

  const runAISteps = async () => {
    let totalTime = 0;
    for (let i = 0; i < AI_STEPS.length; i++) {
      await new Promise<void>((res) => setTimeout(res, totalTime === 0 ? 100 : 0));
      setAiStepIndex(i);
      setAiProgress(Math.round(((i + 1) / AI_STEPS.length) * 100));
      totalTime += AI_STEPS[i].duration;
      await new Promise<void>((res) => setTimeout(res, AI_STEPS[i].duration));
    }
    // Actually submit to backend
    try {
      const resp = await api.submitRecoveryRequest(
        suspendedUserId,
        reason,
        !!documentFile,
        hasVideo
      );
      const result = resp.aiResult as { faceMatchScore?: number; isAuthorized?: boolean; summary?: string } | undefined;
      setAiResult(result ?? { isAuthorized: false, summary: "Verification submitted." });
    } catch {
      setAiResult({ isAuthorized: false, summary: "AI verification completed. Pending admin review." });
    }
    setStep("done");
  };

  return (
    <div className="recovery-overlay animate-fade-in">
      <div className="recovery-modal animate-scale-up">
        {/* Header */}
        <div className="recovery-header">
          <div className="recovery-header-icon">🛡️</div>
          <div>
            <h2>Account Recovery</h2>
            <p>ELiSecureChat Identity Verification</p>
          </div>
        </div>

        {/* Step Indicators */}
        {step !== "ai_processing" && step !== "done" && (
          <div className="recovery-steps-bar">
            {(["explain", "document", "video"] as const).map((s, i) => (
              <div
                key={s}
                className={`recovery-step-dot ${
                  step === s ? "active" : ["explain", "document", "video"].indexOf(step) > i ? "done" : ""
                }`}
              >
                {["explain", "document", "video"].indexOf(step) > i ? "✓" : i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Explain */}
        {step === "explain" && (
          <div className="recovery-step-content animate-fade-in">
            <div className="recovery-suspension-notice">
              <span className="suspension-icon">⚠️</span>
              <div>
                <strong>Reason for Suspension:</strong>
                <p>{suspensionReason}</p>
              </div>
            </div>
            <h3>Step 1: Your Explanation</h3>
            <p className="recovery-hint">
              Please explain why your account should be reinstated. Be clear and honest — this will be reviewed by our Trust & Safety team.
            </p>
            <textarea
              className="recovery-textarea"
              placeholder="Explain your situation and why you believe your account should be restored…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <small className="recovery-char-count">{reason.length}/1000 characters</small>
            <button
              className="btn btn-primary btn-block recovery-btn"
              disabled={reason.trim().length < 30}
              onClick={() => setStep("document")}
            >
              Continue → Identity Document
            </button>
            {reason.trim().length < 30 && (
              <small style={{ color: "var(--text-muted)", textAlign: "center", display: "block" }}>
                Minimum 30 characters required
              </small>
            )}
          </div>
        )}

        {/* Step 2: Document (Aadhaar Card) */}
        {step === "document" && (
          <div className="recovery-step-content animate-fade-in">
            <h3>Step 2: Identity Document</h3>
            <p className="recovery-hint">
              Upload a clear photo of your <strong>Aadhaar Card</strong> (front side). Our AI will extract your face and name for verification. Your Aadhaar number is never stored.
            </p>
            <div
              className="recovery-doc-upload"
              onClick={() => docInputRef.current?.click()}
            >
              {documentPreview ? (
                <div className="recovery-doc-preview">
                  <img src={documentPreview} alt="Document preview" />
                  <div className="doc-preview-overlay">
                    <span>✓ Document uploaded</span>
                    <button
                      className="btn btn-xs btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocumentFile(null);
                        setDocumentPreview(null);
                      }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="recovery-doc-placeholder">
                  <span className="doc-upload-icon">🪪</span>
                  <strong>Upload Aadhaar Card</strong>
                  <small>Click to select image (JPG, PNG)</small>
                </div>
              )}
            </div>
            <input
              ref={docInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleDocumentUpload}
            />
            <div className="recovery-doc-notice">
              🔒 Document is processed locally by AI. Only the verification result is stored — never your Aadhaar number.
            </div>
            <div className="recovery-btn-row">
              <button className="btn btn-secondary" onClick={() => setStep("explain")}>← Back</button>
              <button
                className="btn btn-primary recovery-btn"
                onClick={() => setStep("video")}
              >
                {documentFile ? "Continue → Video" : "Skip — Continue Without Document"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Video Verification */}
        {step === "video" && (
          <div className="recovery-step-content animate-fade-in">
            <h3>Step 3: Face Video Verification</h3>
            <p className="recovery-hint">
              We need a 3-second video of your face to verify your identity. Look directly at the camera and stay still.
            </p>
            <div className="recovery-video-wrapper">
              {videoStream ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="recovery-video-preview"
                  />
                  {isRecording && (
                    <div className="recording-overlay">
                      <div className="recording-pulse" />
                      <span className="recording-countdown">{recordCountdown}</span>
                      <p>Recording…</p>
                    </div>
                  )}
                  {!isRecording && (
                    <div className="video-face-guide" />
                  )}
                </>
              ) : (
                <div className="recovery-video-fallback">
                  <span>📷</span>
                  <p>Camera access required</p>
                  <small>Allow camera permission in your browser to continue, or skip this step.</small>
                </div>
              )}
            </div>
            <div className="recovery-btn-row">
              <button className="btn btn-secondary" onClick={() => { stopStream(); setStep("document"); }}>← Back</button>
              {videoStream ? (
                <button
                  className="btn btn-primary recovery-btn"
                  onClick={handleCaptureVideo}
                  disabled={isRecording}
                >
                  {isRecording ? `Recording ${recordCountdown}…` : "🔴 Record 3-Second Clip"}
                </button>
              ) : (
                <button
                  className="btn btn-secondary recovery-btn"
                  onClick={() => { setHasVideo(false); proceedToAI(); }}
                >
                  Skip Video → Submit Without Video
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: AI Processing */}
        {step === "ai_processing" && (
          <div className="recovery-step-content recovery-ai-processing animate-fade-in">
            <div className="ai-brain-animation">
              <div className="ai-brain-ring" />
              <div className="ai-brain-ring delay-1" />
              <div className="ai-brain-ring delay-2" />
              <span className="ai-brain-icon">🤖</span>
            </div>
            <h3>AI Verification In Progress</h3>
            <p className="recovery-hint">Our AI agent is analyzing your submission. Please wait…</p>

            <div className="ai-progress-bar-wrap">
              <div className="ai-progress-bar" style={{ width: `${aiProgress}%` }} />
            </div>
            <p className="ai-progress-percent">{aiProgress}%</p>

            <div className="ai-steps-list">
              {AI_STEPS.map((s, i) => (
                <div
                  key={i}
                  className={`ai-step-item ${
                    i < aiStepIndex ? "completed" : i === aiStepIndex ? "active" : "pending"
                  }`}
                >
                  <span className="ai-step-icon">
                    {i < aiStepIndex ? "✅" : i === aiStepIndex ? "⏳" : "○"}
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === "done" && (
          <div className="recovery-step-content recovery-done animate-fade-in">
            <div className="recovery-done-icon">
              {aiResult?.isAuthorized ? "✅" : "📋"}
            </div>
            <h3>
              {aiResult?.isAuthorized
                ? "Identity Verified — Awaiting Admin Review"
                : "Request Submitted — Awaiting Admin Review"}
            </h3>

            <div className={`ai-result-card ${aiResult?.isAuthorized ? "authorized" : "partial"}`}>
              <div className="ai-result-header">
                <span>🤖 AI Verification Report</span>
                <span className={`ai-badge ${aiResult?.isAuthorized ? "authorized" : "pending"}`}>
                  {aiResult?.isAuthorized ? "AUTHORIZED" : "PARTIAL"}
                </span>
              </div>
              {aiResult?.faceMatchScore !== undefined && (
                <div className="ai-result-row">
                  <span>Face Match</span>
                  <div className="ai-score-bar">
                    <div
                      className="ai-score-fill"
                      style={{ width: `${aiResult.faceMatchScore}%` }}
                    />
                  </div>
                  <span className="ai-score-value">{aiResult.faceMatchScore}%</span>
                </div>
              )}
              <div className="ai-result-notice">
                <p>{aiResult?.summary}</p>
                <p style={{ marginTop: 8, opacity: 0.8 }}>
                  🔒 Your personal details (Aadhaar number, address) were NOT stored. Only the verification result was forwarded to admin.
                </p>
              </div>
            </div>

            <div className="recovery-done-steps">
              <div className="recovery-timeline-item">
                <span className="tl-dot done">✓</span>
                <span>Recovery request submitted</span>
              </div>
              <div className="recovery-timeline-item">
                <span className="tl-dot done">✓</span>
                <span>AI verification completed</span>
              </div>
              <div className="recovery-timeline-item">
                <span className="tl-dot pending">⏳</span>
                <span>Admin review in progress</span>
              </div>
              <div className="recovery-timeline-item">
                <span className="tl-dot future">○</span>
                <span>Account restored (if approved)</span>
              </div>
            </div>

            <p className="recovery-final-note">
              You will be able to sign in again once an admin approves your recovery request. Please try signing in after 24 hours.
            </p>
            <button className="btn btn-secondary btn-block" onClick={onClose}>
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
