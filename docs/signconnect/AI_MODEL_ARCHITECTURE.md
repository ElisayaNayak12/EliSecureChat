# SignConnect AI — AI/ML Architecture (plan)

**Status (2026-11-10):**

| Module | State |
|---|---|
| Hand landmarks + gestures | **Working:** MediaPipe Gesture Recognizer float16/1 (Apache-2.0), pinned SHA-256 `97952348…0482`, 7 pretrained gestures, GPU with CPU fallback and warm-up, WASM served from the app. In testing, the official thumbs_up, victory and pointing_up sample photos were detected live (73–94%); the thumbs_down sample was not |
| Speech recognition | **Prototype:** Whisper tiny.en q8 (MIT) via Transformers.js 4.3.1 + ONNX Runtime Web, in a Web Worker |
| Sign recognition (trained) | **Pipeline working; no published ISL model yet.** `ai/signconnect_ai` trains BiGRU / temporal-CNN on consented landmark recordings, evaluates on held-out signers and exports ONNX, which runs on-device via ONNX Runtime Web. See `ai/README.md` |
| Sign recognition (personal) | **Personal prototype:** DTW 1-NN per sign over the user's own examples, with rejection |
| Translation (gloss → English) | Not implemented. A personal sign maps to the user's own English text |
| TTS | **Working (web):** browser on-device voices (`localService` only) |
| Sign-video retrieval | **Working pipeline,** 0 real verified clips |

No model binaries are committed to Git. Models are downloaded at runtime and cached by the browser.

## Principles (spec sections 4, 5, 13)

- Primary inference runs **on the user's device** (web: ONNX Runtime Web with WASM, or WebGPU where supported; Android: LiteRT or ONNX Runtime Mobile). Raw camera and microphone streams are never uploaded by default.
- AI code lives under `ai/` (Python) and is kept separate from product code. Clients only consume exported, signed artefacts through the model registry.
- Landmark detection is **not** sign recognition. Recognition output is **not** translation. Each stage reports its own confidence.
- Below a confidence threshold, the UI shows "uncertain" and offers correction. It never guesses silently. No translation is ever random or prerecorded.
- Sign production uses **verified human recordings**. Clips are never stitched together and presented as a grammatical sentence. With no validated video, the UI shows a clear fallback.

## Modules and planned phases

| Module | Phase | Candidate tech (to be evaluated, licences checked before use) | Output |
|---|---|---|---|
| Speech recognition | 4 | whisper.cpp, sherpa-onnx streaming models | partial + final transcripts with confidence |
| Landmark extraction | 5 | MediaPipe Holistic / Hands + Pose + Face (Tasks API) | normalised temporal landmark tensors |
| Isolated sign recognition | 5 | ST-GCN, BiLSTM, temporal Transformer (compared, not assumed) | gloss + confidence |
| Continuous recognition | 6 | Same families + CTC decoding | gloss sequence |
| Gloss → English translation | 6 | Seq2seq / small LM, language-specific; must not invent signs | English text + confidence |
| Text-to-speech | 6 | Local TTS model (to be chosen). Today: browser local voices for preview only | audio, interruptible |
| Sign-video retrieval | 7 | Indexed lookup over verified sentence/phrase clips (`sign_video_*` tables) | clip ids, or an explicit "no verified signing" |

## Model manager (Phase 5 onward)

Download → SHA-256 check → signature verification → install (IndexedDB on web, app storage on Android) →
version tracking → rollback to `previous_model_version_id` → storage and low-memory management →
device-capability detection (WebGPU, RAM) to pick the right artefact. Schema: `model_versions`,
`model_language_support` and `device_model_installs`.

## Evaluation (required before any quality claim)

WER (speech) · recognition accuracy · gloss error rate · translation quality · **signer-independent splits** ·
lighting and camera variation · latency · memory · battery · thermals · human comprehension testing with Deaf
signers and qualified language experts.

## Dependencies blocking Phase 5

1. A licence-reviewed dataset approved for the intended use, or a consent-based proprietary recording programme (see DATASET_LICENSES.md).
2. A Python 3.11/3.12 environment with GPU access for training (the machine has Python 3.14, which most ML wheels do not support yet).
3. Native ISL language experts for annotation and validation.
