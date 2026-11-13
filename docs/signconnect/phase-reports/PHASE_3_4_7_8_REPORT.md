# Phase report — Calls with sign-language assistance (Phases 3, 4, 7, 8 prototypes)

Date: 2026-11-10

## What works (verified)

End-to-end run with two real Chrome browsers (fake camera; the microphone played a spoken WAV), **13/13 checks passed**:
1. The call rings on the other browser.
2. Live video arrives in both directions over WebRTC.
3. The connected timer runs.
4. A typed caption is delivered.
5. With no verified ISL clip, the honest fallback text is shown.
6. A clip upload is accepted as UNVERIFIED.
7. After admin verification, the clip plays for the exact sentence.
8. The MediaPipe model downloads, passes its SHA-256 check and tracks hands on the GPU.
9. Whisper on the caller's device transcribed "Hello Asha.", "How are you today?" and "I am testing live captions.", and the captions were delivered to the other person. One error: it spelled the name "Aesha" once.
10. Hang-up works on both sides.
11. Call history is recorded with `aiAssistUsed`.
12. The Translator page shows model state.

Automated suites: backend **30/30**, web **8/8**. All three apps build.

## Honest status

| Feature | Label |
|---|---|
| 1:1 WebRTC calls | Working (no TURN, no group calls) |
| Live captions (Whisper tiny.en) | Prototype, real model, English only, no confidence score, WER not measured |
| Hand landmarks (MediaPipe) | Working |
| Sign → text | **Personal prototype.** It recognises only the user's own recorded signs. Not ISL recognition |
| Sign-video library | Working pipeline, **0 real verified clips** |
| Reading signs aloud | Working (browser on-device voices) |
| Flutter / Android | **Not started.** The Flutter SDK is not installed on this machine |

## What is still missing to meet the spec's goal

1. A trained ISL recognition model. This needs licence-reviewed or consent-based ISL data, native-signer annotation, and training on GPU with Python 3.11/3.12.
2. Real verified ISL sentence videos recorded by consenting signers and checked by experts.
3. Flutter app (needs the Flutter + Android SDK), TURN server, group calls, and Phase 1b authentication.
