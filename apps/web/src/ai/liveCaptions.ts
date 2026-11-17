/**
 * Live captions from a microphone stream, transcribed on the device by the Whisper worker.
 *
 * Pipeline: 16 kHz mono capture -> energy-based voice activity detection with an adaptive noise floor ->
 * partial transcripts every ~2 s while someone is speaking -> a final transcript when they pause.
 * Whisper does not expose a calibrated confidence, so captions carry confidence = null (shown as "n/a").
 */
import { ASR_MODEL } from "./models";

export type CaptionEvent = { text: string; final: boolean; latencyMs: number };
export type AsrState = "idle" | "loading" | "listening" | "transcribing" | "error";

const RATE = 16000;
const BLOCK = 2048; // 128 ms
const SILENCE_TO_FINAL_MS = 700;
const MAX_UTTERANCE_S = 10;
const PARTIAL_EVERY_MS = 2000;

let worker: Worker | null = null;
function getWorker() {
  if (!worker) worker = new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Preload/download the ASR model without starting the microphone. */
export function preloadAsr(onProgress: (f: number) => void): Promise<void> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data.type === "progress") onProgress(e.data.fraction);
      else if (e.data.type === "ready") {
        w.removeEventListener("message", onMsg);
        onProgress(1);
        resolve();
      } else if (e.data.type === "error" && e.data.id === undefined) {
        w.removeEventListener("message", onMsg);
        reject(new Error(e.data.message));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "load" });
  });
}

export class LiveCaptioner {
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private speaking = false;
  private silenceMs = 0;
  private sinceLastPartial = 0;
  private noiseFloor = 0.005;
  private nextId = 1;
  private busy = false;
  private pendingFinal: Float32Array | null = null;
  readonly engine = ASR_MODEL.id;

  constructor(
    private readonly onCaption: (c: CaptionEvent) => void,
    private readonly onState: (s: AsrState, detail?: string) => void,
  ) {}

  async start(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No microphone track available.");
    this.onState("loading");
    await preloadAsr((f) => this.onState("loading", `${Math.round(f * 100)}%`));
    getWorker().addEventListener("message", this.onWorker);

    this.ctx = new AudioContext({ sampleRate: RATE });
    // Use only the audio track so muting the camera does not matter, and clone it so stopping captions
    // never stops the call's microphone.
    this.source = this.ctx.createMediaStreamSource(new MediaStream([track.clone()]));
    this.node = this.ctx.createScriptProcessor(BLOCK, 1, 1);
    this.node.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
    this.source.connect(this.node);
    this.node.connect(this.ctx.destination); // required for ScriptProcessor to run; output is silent
    this.onState("listening");
  }

  stop() {
    getWorker().removeEventListener("message", this.onWorker);
    this.node?.disconnect();
    this.source?.mediaStream.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.chunks = [];
    this.speaking = false;
    this.onState("idle");
  }

  private onAudio(input: Float32Array) {
    const block = Float32Array.from(input); // the browser reuses the buffer
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    const blockMs = (block.length / RATE) * 1000;
    const isSpeech = rms > Math.max(0.012, this.noiseFloor * 3);
    if (!isSpeech) this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;

    if (isSpeech) {
      if (!this.speaking) {
        this.speaking = true;
        this.sinceLastPartial = 0;
      }
      this.silenceMs = 0;
    } else if (this.speaking) {
      this.silenceMs += blockMs;
    }
    if (!this.speaking) return;

    this.chunks.push(block);
    this.sinceLastPartial += blockMs;
    const lengthS = (this.chunks.length * BLOCK) / RATE;

    if (this.silenceMs >= SILENCE_TO_FINAL_MS || lengthS >= MAX_UTTERANCE_S) {
      const audio = this.concat();
      this.chunks = [];
      this.speaking = false;
      this.silenceMs = 0;
      if (audio.length > RATE * 0.4) this.send(audio, true);
    } else if (this.sinceLastPartial >= PARTIAL_EVERY_MS && !this.busy) {
      this.sinceLastPartial = 0;
      this.send(this.concat(), false);
    }
  }

  private concat() {
    const out = new Float32Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  private send(audio: Float32Array, final: boolean) {
    if (this.busy) {
      if (final) this.pendingFinal = audio; // never drop a finished sentence
      return;
    }
    this.busy = true;
    this.onState("transcribing");
    getWorker().postMessage({ type: "transcribe", id: this.nextId++, audio, final }, [audio.buffer]);
  }

  private onWorker = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "result") {
      this.busy = false;
      if (m.text) this.onCaption({ text: m.text, final: m.final, latencyMs: m.latencyMs });
      if (this.pendingFinal) {
        const next = this.pendingFinal;
        this.pendingFinal = null;
        this.send(next, true);
      } else if (this.ctx) this.onState("listening");
    } else if (m.type === "error") {
      this.busy = false;
      this.onState("error", m.message);
    }
  };
}
