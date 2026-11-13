/**
 * One-to-one WebRTC audio/video calls (SignConnect Phase 3).
 *
 * Signalling (invite/accept/SDP/ICE) goes through the backend Socket.IO gateway; media flows peer-to-peer.
 * Captions and sign translations produced on this device are relayed as small text payloads.
 *
 * Limitations (documented): no TURN server is configured by default, so calls between networks behind
 * strict NATs may fail; no group calls; media is protected by WebRTC's DTLS-SRTP transport encryption
 * between the two browsers (no SFU in the path), but there is no additional app-level end-to-end layer.
 */
import type { Socket } from "socket.io-client";

export type CallPhase = "outgoing" | "incoming" | "connecting" | "active" | "ended";
export type CallMedia = "AUDIO" | "VIDEO";
export type CallPeer = { id: string; name: string; avatarUrl?: string };
export type QualityLevel = "unknown" | "good" | "fair" | "poor";

export type TranslationPayload = {
  source: "speech" | "sign" | "typed";
  text: string;
  final: boolean;
  confidence: number | null;
  gloss?: string[];
  language: string;
  engine: string;
  corrected?: boolean;
};

export type TranslationEntry = { id: string; from: "me" | "peer"; payload: TranslationPayload; at: string };

export type CallSnapshot = {
  phase: CallPhase;
  callId: string | null;
  chatId: string;
  peer: CallPeer;
  media: CallMedia;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  canSwitchCamera: boolean;
  quality: { level: QualityLevel; rttMs?: number; lossPct?: number };
  connectedAt?: number;
  endReason?: string;
  error?: string;
  translations: TranslationEntry[];
  /** Interim (non-final) captions, keyed by sender, shown live and replaced by the final text. */
  interim: { me?: TranslationPayload; peer?: TranslationPayload };
  /** What the other participant shared when the call connected (their sign language, if they sign). */
  peerProfile?: { signLanguage: string | null };
};

function iceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (raw) {
    try {
      return JSON.parse(raw) as RTCIceServer[];
    } catch {
      console.error("VITE_ICE_SERVERS is not valid JSON; falling back to public STUN.");
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

const END_REASONS: Record<string, string> = {
  HANGUP: "Call ended",
  DECLINED: "Call declined",
  NO_ANSWER: "No answer",
  CANCELLED: "Call cancelled",
  DISCONNECTED: "The other person disconnected",
  ANSWERED_ELSEWHERE: "Answered on another device",
  PEER_OFFLINE: "They are offline right now",
  BUSY: "They are on another call",
  MEDIA_DENIED: "Camera or microphone permission was denied",
  CONNECTION_FAILED: "Could not connect the call (network)",
  BLOCKED: "You can't call this person (one of you has blocked the other)",
  NOT_AUTHENTICATED: "Your session expired. Please sign in again.",
};

export function describeEndReason(reason?: string) {
  return (reason && END_REASONS[reason]) || reason || "Call ended";
}

type Listener = (s: CallSnapshot | null) => void;

export class CallManager {
  private snap: CallSnapshot | null = null;
  private listeners = new Set<Listener>();
  private pc: RTCPeerConnection | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private statsTimer: number | undefined;
  private restartedIce = false;
  private attached = false;

  constructor(private readonly socket: Socket) {}

  /* ---------------- subscription ---------------- */

  get snapshot() {
    return this.snap;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snap);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<CallSnapshot> | null) {
    this.snap = patch === null ? null : ({ ...(this.snap as CallSnapshot), ...patch } as CallSnapshot);
    for (const l of this.listeners) l(this.snap);
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    this.socket.on("call:incoming", this.onIncoming);
    this.socket.on("call:accepted", this.onAccepted);
    this.socket.on("call:ended", this.onEnded);
    this.socket.on("call:signal", this.onSignal);
    this.socket.on("call:translation", this.onTranslation);
    this.socket.on("call:profile", this.onProfile);
  }

  detach() {
    this.attached = false;
    this.socket.off("call:incoming", this.onIncoming);
    this.socket.off("call:accepted", this.onAccepted);
    this.socket.off("call:ended", this.onEnded);
    this.socket.off("call:signal", this.onSignal);
    this.socket.off("call:translation", this.onTranslation);
    this.socket.off("call:profile", this.onProfile);
    if (this.snap && this.snap.phase !== "ended") void this.hangup();
  }

  private emit<T = { ok: boolean; error?: string; callId?: string }>(event: string, payload: unknown): Promise<T> {
    return this.socket.timeout(8000).emitWithAck(event, payload) as Promise<T>;
  }

  /* ---------------- media ---------------- */

  private async getMedia(media: CallMedia) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: media === "VIDEO" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
    });
  }

  private async countCameras() {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length;
    } catch {
      return 0;
    }
  }

  /* ---------------- outgoing ---------------- */

  async start(chatId: string, media: CallMedia, peer: CallPeer) {
    if (this.snap && this.snap.phase !== "ended") throw new Error("A call is already in progress.");
    this.set({
      phase: "outgoing", callId: null, chatId, peer, media, localStream: null, remoteStream: null,
      micOn: true, camOn: media === "VIDEO", canSwitchCamera: false, quality: { level: "unknown" },
      translations: [], interim: {}, peerProfile: undefined, endReason: undefined, error: undefined,
    });
    let stream: MediaStream;
    try {
      stream = await this.getMedia(media);
    } catch (err) {
      this.end("MEDIA_DENIED", (err as Error).message);
      return;
    }
    this.set({ localStream: stream, canSwitchCamera: media === "VIDEO" && (await this.countCameras()) > 1 });
    let res;
    try {
      res = await this.emit("call:invite", { chatId, media });
    } catch {
      this.end("CONNECTION_FAILED", "The server did not respond.");
      return;
    }
    if (!res.ok) {
      this.end(res.error ?? "FAILED");
      return;
    }
    if (this.snap?.phase === "outgoing") this.set({ callId: res.callId ?? null });
  }

  private onAccepted = async ({ callId }: { callId: string }) => {
    if (!this.snap || this.snap.callId !== callId) return;
    this.set({ phase: "connecting" });
    const pc = this.createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.emit("call:signal", { callId, data: { type: "offer", sdp: offer.sdp } });
  };

  /* ---------------- incoming ---------------- */

  private onIncoming = (p: { callId: string; chatId: string; media: CallMedia; from: CallPeer }) => {
    if (this.snap && this.snap.phase !== "ended") {
      void this.emit("call:decline", { callId: p.callId }); // already on a call
      return;
    }
    this.set({
      phase: "incoming", callId: p.callId, chatId: p.chatId, peer: p.from, media: p.media, localStream: null,
      remoteStream: null, micOn: true, camOn: p.media === "VIDEO", canSwitchCamera: false,
      quality: { level: "unknown" }, translations: [], interim: {}, peerProfile: undefined, endReason: undefined, error: undefined,
    });
  };

  async accept(asAudioOnly = false) {
    if (!this.snap || this.snap.phase !== "incoming" || !this.snap.callId) return;
    const media: CallMedia = asAudioOnly ? "AUDIO" : this.snap.media;
    let stream: MediaStream;
    try {
      stream = await this.getMedia(media);
    } catch (err) {
      await this.emit("call:decline", { callId: this.snap.callId }).catch(() => undefined);
      this.end("MEDIA_DENIED", (err as Error).message);
      return;
    }
    this.set({ phase: "connecting", localStream: stream, camOn: media === "VIDEO", canSwitchCamera: media === "VIDEO" && (await this.countCameras()) > 1 });
    this.createPeerConnection(); // must exist before the offer arrives
    const res = await this.emit("call:accept", { callId: this.snap.callId }).catch(() => ({ ok: false, error: "CONNECTION_FAILED" }));
    if (!res.ok) this.end(res.error ?? "FAILED");
  }

  async decline() {
    if (!this.snap?.callId) return;
    await this.emit("call:decline", { callId: this.snap.callId }).catch(() => undefined);
    this.end("DECLINED");
  }

  /* ---------------- peer connection ---------------- */

  private createPeerConnection() {
    this.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc = pc;
    this.pendingIce = [];
    this.restartedIce = false;
    const local = this.snap?.localStream;
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    // Make sure we can RECEIVE video even if we only send audio.
    if (this.snap?.media === "VIDEO" && !local?.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.set({ remoteStream: stream });
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && this.snap?.callId) {
        void this.emit("call:signal", { callId: this.snap.callId, data: { type: "ice", candidate: e.candidate.toJSON() } });
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        this.set({ phase: "active", connectedAt: this.snap?.connectedAt ?? Date.now() });
        this.startStats();
      } else if (st === "disconnected") {
        this.set({ quality: { level: "poor" } });
      } else if (st === "failed") {
        if (!this.restartedIce && this.snap?.callId) {
          this.restartedIce = true;
          pc.restartIce();
        } else {
          void this.hangup("CONNECTION_FAILED");
        }
      }
    };
    return pc;
  }

  private onSignal = async ({ callId, data }: { callId: string; data: { type: string; sdp?: string; candidate?: RTCIceCandidateInit } }) => {
    if (!this.snap || this.snap.callId !== callId || !this.pc) return;
    const pc = this.pc;
    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        await this.flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.emit("call:signal", { callId, data: { type: "answer", sdp: answer.sdp } });
      } else if (data.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        await this.flushIce();
      } else if (data.type === "ice" && data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else this.pendingIce.push(data.candidate);
      }
    } catch (err) {
      console.error("Call signalling error:", err);
      this.set({ error: `Signalling error: ${(err as Error).message}` });
    }
  };

  private async flushIce() {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) await this.pc?.addIceCandidate(c);
  }

  private startStats() {
    window.clearInterval(this.statsTimer);
    let lastLost = 0;
    let lastRecv = 0;
    this.statsTimer = window.setInterval(async () => {
      if (!this.pc) return;
      const stats = await this.pc.getStats();
      let rtt: number | undefined;
      let lost = 0;
      let recv = 0;
      stats.forEach((r) => {
        if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated && typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime * 1000;
        if (r.type === "inbound-rtp" && !r.isRemote) {
          lost += r.packetsLost ?? 0;
          recv += r.packetsReceived ?? 0;
        }
      });
      const dLost = lost - lastLost;
      const dRecv = recv - lastRecv;
      lastLost = lost;
      lastRecv = recv;
      const lossPct = dRecv + dLost > 0 ? (dLost / (dRecv + dLost)) * 100 : 0;
      const level: QualityLevel = rtt === undefined ? "unknown" : rtt < 150 && lossPct < 2 ? "good" : rtt < 400 && lossPct < 8 ? "fair" : "poor";
      this.set({ quality: { level, rttMs: rtt === undefined ? undefined : Math.round(rtt), lossPct: Math.round(lossPct * 10) / 10 } });
    }, 2000);
  }

  /* ---------------- controls ---------------- */

  toggleMic() {
    const s = this.snap;
    if (!s?.localStream) return;
    const on = !s.micOn;
    s.localStream.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ micOn: on });
  }

  toggleCamera() {
    const s = this.snap;
    if (!s?.localStream) return;
    const on = !s.camOn;
    s.localStream.getVideoTracks().forEach((t) => (t.enabled = on));
    this.set({ camOn: on });
  }

  async switchCamera() {
    const s = this.snap;
    if (!s?.localStream) return;
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    if (cams.length < 2) return;
    const current = s.localStream.getVideoTracks()[0];
    const currentId = current?.getSettings().deviceId;
    const nextCam = cams[(cams.findIndex((c) => c.deviceId === currentId) + 1) % cams.length];
    const fresh = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nextCam.deviceId } } });
    const track = fresh.getVideoTracks()[0];
    await this.pc?.getSenders().find((x) => x.track?.kind === "video")?.replaceTrack(track);
    if (current) {
      s.localStream.removeTrack(current);
      current.stop();
    }
    track.enabled = s.camOn;
    s.localStream.addTrack(track);
    this.set({ localStream: new MediaStream(s.localStream.getTracks()) });
  }

  /** Sends a caption/translation produced on this device to the other participant. */
  async sendTranslation(payload: TranslationPayload) {
    const s = this.snap;
    if (!s?.callId || s.phase !== "active") throw new Error("The call is not connected.");
    const res = await this.emit("call:translation", { callId: s.callId, payload });
    if (!res.ok) throw new Error(res.error ?? "Translation not delivered.");
    this.record("me", payload);
  }

  /** Tells the other side which sign language this user reads (null = does not sign). */
  async sendProfile(profile: { signLanguage: string | null }) {
    const s = this.snap;
    if (!s?.callId || s.phase !== "active") return;
    await this.emit("call:profile", { callId: s.callId, profile }).catch(() => undefined);
  }

  private onProfile = ({ callId, profile }: { callId: string; profile: { signLanguage: string | null } }) => {
    if (!this.snap || this.snap.callId !== callId) return;
    this.set({ peerProfile: profile });
  };

  /** Shows a local interim caption without sending it. */
  setLocalInterim(payload: TranslationPayload | undefined) {
    if (this.snap) this.set({ interim: { ...this.snap.interim, me: payload } });
  }

  private onTranslation = ({ callId, payload, at }: { callId: string; payload: TranslationPayload; at: string }) => {
    if (!this.snap || this.snap.callId !== callId) return;
    this.record("peer", payload, at);
  };

  private record(from: "me" | "peer", payload: TranslationPayload, at = new Date().toISOString()) {
    if (!this.snap) return;
    if (!payload.final) {
      this.set({ interim: { ...this.snap.interim, [from]: payload } });
      return;
    }
    const entry: TranslationEntry = { id: crypto.randomUUID(), from, payload, at };
    this.set({ translations: [...this.snap.translations, entry].slice(-60), interim: { ...this.snap.interim, [from]: undefined } });
  }

  /* ---------------- ending ---------------- */

  async hangup(reason = "HANGUP") {
    const id = this.snap?.callId;
    if (id) await this.emit("call:end", { callId: id }).catch(() => undefined);
    this.end(reason);
  }

  private onEnded = ({ callId, reason }: { callId: string; reason: string }) => {
    if (!this.snap || this.snap.callId !== callId) return;
    this.end(reason);
  };

  private end(reason: string, error?: string) {
    window.clearInterval(this.statsTimer);
    this.pc?.close();
    this.pc = null;
    this.snap?.localStream?.getTracks().forEach((t) => t.stop());
    if (this.snap) this.set({ phase: "ended", endReason: reason, error, localStream: null, remoteStream: null });
  }

  /** Clears an ended call from the UI. */
  dismiss() {
    if (this.snap?.phase === "ended") this.set(null);
  }
}
