# SignConnect AI — Development Roadmap & Gap Analysis

Source of requirements: `Sigin Language AI based Video Chat.docx` (SignConnect AI master instructions).
Base code: the existing **ELiSecureChat** monorepo (NestJS backend, React/Vite web, React/Vite admin).
The spec allows adapting its structure to an established repository (section 11), so SignConnect is
being built **into** this codebase rather than as a rewrite.

Last updated: 2026-11-10 (Phase 3/4/7/8 prototypes added).

## Status legend (spec section 13)

| Label | Meaning |
|---|---|
| **Working** | Real functionality, exercised by tests or manual verification. |
| **Prototype** | Works end to end but incomplete or not hardened. |
| **Mock** | Simulated behaviour. Must never be presented to users as real. |
| **Research** | Experiment only. |
| **Not implemented** | Nothing exists yet. |

## 1. Environment inspection (2026-11-10)

| Tool | Status |
|---|---|
| Node.js | v24.15.0 ✓ |
| npm | 11.12.1 ✓ |
| Python | 3.14.6 ✓ (AI pipeline will need a 3.11/3.12 env; PyTorch/MediaPipe wheels lag new Python releases) |
| Git | 2.55 ✓ (repo on `main`, remote configured) |
| Flutter / Dart | **Not installed**, so the Android app (spec section 3) cannot be built or run here. No Flutter code has been written: unverifiable code would break the spec's testing rules |
| Docker | **Not installed**, so there is no local Postgres, Redis, LiveKit or TURN via Compose |
| PostgreSQL (psql) | **Not installed**, so migrations are written but not yet executed |

## 2. Gap analysis: spec vs. current code

### Platform

| Area | Spec asks for | Current state | Status |
|---|---|---|---|
| Web frontend | React + Next.js + Tailwind | React 19 + Vite 7, custom CSS design system (AURA / Verdant) | Working (stack differs; see ARCHITECTURE.md §Decisions) |
| Android app | Flutter, Riverpod, GoRouter | `apps/mobile` is an empty React Native starter | Not implemented |
| Backend | Modular NestJS | NestJS modules: auth, users, chats, messages, communities, uploads, admin, languages | Working |
| Database | PostgreSQL, normalised, migrations | JSON file store (`apps/backend/data/store.json`) | Prototype. Target schema in `infrastructure/database/migrations/0001_*.sql` |
| Object storage | S3-compatible | Local disk uploads | Prototype |
| Tests | Unit / integration / API / UI / … | Phase 1a backend tests (21). Earlier features have only smoke scripts | Partial |

### Authentication & profiles (Phase 1)

| Feature | Current state | Status |
|---|---|---|
| Registration / login / logout | Phone + password, scrypt hashing | Working |
| Access tokens | 15-min HS256 JWT verified on every route and on the socket handshake (**Phase 1b, 2026-11-12**) | Working |
| JWT, short-lived tokens, refresh rotation | httpOnly refresh cookie, rotation, reuse detection | Working |
| Role-based access | Object-level AccessGuard for users; separate hashed, expiring admin sessions | Working |
| Password recovery | One-time code (hashed, 10 min, 5 tries). Dev prints it to the console; **an SMS provider is needed for production** | Working in dev |
| Email/phone verification | None. Needs an SMS/email provider | Not implemented |
| Device sessions | List, remote sign-out, sign out others, change password | Working |
| Profile: name, photo | Yes | Working |
| Preferred language / sign language | **Added in Phase 1a** | Working |
| Accessibility prefs: text size, high contrast, reduce motion, visual alerts | **Added in Phase 1a** | Working |
| Voice prefs: on-device voice, speaking rate, preview | **Added in Phase 1a** (browser `speechSynthesis`, local voices only) | Working (web only) |
| Theme | Light/dark, now also saved to profile | Working |

### Contacts, messaging, groups, notifications (Phase 2)

| Feature | Status |
|---|---|
| Search users | Working |
| Contact requests (accept/reject), block users | Not implemented. Any user can message anyone |
| One-to-one messaging, replies, reactions, read/delivered receipts, pin, unread counts | Working |
| Groups ("communities") | Working (basic) |
| Image / video / file attachments | Working |
| Voice messages | Not implemented |
| Message search | Prototype (client-side) |
| Offline message queue | Not implemented |
| Notifications (messages, calls, contact requests) | Prototype (in-app only, no push) |

### Calls & realtime (Phase 3)

| Feature | Status |
|---|---|
| WebSocket realtime (Socket.IO) | Working. The "sync failed: socket disconnected" race was **fixed** (socket no longer drops when switching chats; presence and rooms re-registered after any reconnect) |
| 1:1 audio/video calls | **Working (WebRTC peer-to-peer).** Invite/accept/decline/hang-up, SDP and ICE relayed by the gateway, ring timeout leads to MISSED, busy and offline detection, mic/camera toggles, camera switching, ICE restart once on failure, network quality from `getStats` |
| Call history | Working (`GET /calls?userId=`), including `aiAssistUsed` |
| STUN | Public Google STUN by default; configurable via `VITE_ICE_SERVERS` |
| TURN, LiveKit SFU, group calls | Not implemented. Calls across strict NATs may fail without TURN |

### AI features (Phases 4–9)

| Feature | Status |
|---|---|
| Offline speech recognition / live captions | **Prototype (real model):** Whisper tiny.en (ONNX, 8-bit) in a Web Worker via Transformers.js; energy VAD; partial + final captions; sent to the peer during calls. English only; confidence not available from the model |
| MediaPipe landmark extraction + gestures | **Working:** Gesture Recognizer (2 hands, 21 points + 7 pretrained gestures), GPU with CPU fallback, warm-up preload, live skeleton overlay and badge in calls. Pose and face landmarks not used yet |
| Gesture → text + speech in calls | **Working:** automatic for signers; ≥70% auto-sent, otherwise confirm; correct after sending; spoken on the hearing side. Gestures are general hand gestures, **not ISL signs**; their English text is user-editable |
| ISL dataset + training pipeline | **Working pipeline, no real data yet:** consent → landmark recording → admin review → export → PyTorch training (signer-independent evaluation) → ONNX → admin publish → on-device inference in calls. Verified end to end with photo stand-ins. A real ISL model needs recordings from real ISL signers |
| Sign recognition | **Personal prototype only:** DTW nearest-neighbour over the user's OWN recorded examples (stored on-device in IndexedDB), with rejection of unknown and ambiguous signs and manual confirm/correct before sending. **No trained ISL model exists**; this does not generalise across signers |
| Gloss → English translation | Not implemented. Each personal sign maps to the English the user typed for it; no grammar |
| Local text-to-speech | **Working (web):** incoming sign/typed translations read aloud with the user's on-device voice and rate |
| Human sign-video library & retrieval | **Working pipeline, empty library:** upload (consent + licence + provenance required, SHA-256 recorded), admin verify/reject/delete, exact whole-sentence lookup of VERIFIED clips only, never stitched; playback with replay and 0.5–1.25× speed; explicit fallback when no verified clip exists. Contains **0 real verified clips** |
| Model manager | **Partial:** download with progress, pinned SHA-256 verification (hand model), Cache Storage, remove, status. Not implemented: signature verification, server-driven updates, rollback |
| Two-way translation inside calls | **Prototype:** speech→captions (hearing→Deaf) + verified video lookup; sign→text (personal) + TTS (Deaf→hearing); typed fallback both ways; enable/disable per feature |
| Language packs ISL/ASL/BSL/Auslan | **Metadata registry added in Phase 1a**. No models, vocabulary or videos for any language |

### Spec-rule violations found in existing code

These pre-date SignConnect work and conflict with spec section 13 or section 10.

| Issue | Where | Action |
|---|---|---|
| UI claimed "End-to-End Cryptography Active" / "AES-256 (End-to-End Encrypted)"; messages are only **Base64-encoded** | `SettingsPanel.tsx`, `ConversationPanel.tsx`, auth hero | **Fixed in Phase 1a**: copy now states E2EE is not enabled |
| Socket presence trusts the `userId` the client sends in `register_presence`; call events derive the user from that registration | gateway | **Fixed in Phase 1b**: the handshake is authenticated and identity comes from the token |
| Account-recovery "AI verification" returns **random** face-match scores (`Math.random()`) and auto-decides authorisation | `apps/backend/src/store/in-memory.store.ts` `processAIVerification()` | **Fixed in Phase 1b**: random scores removed; requests go to manual review |
| Request validation is skipped in dev (tsx emits no decorator metadata, so `ValidationPipe` sees no DTO types) | backend dev server | **Fixed in Phase 1b**: dev runs compiled code (`tsc --watch` + `node --watch`) |
| Field names `encryptedContent` / `decryptMessage` imply encryption | backend + web | Now accurate: `encryptedContent` holds real E2EE envelopes (`e2e1:`). Legacy Base64 messages are still displayed |

## 3. Phase plan

The spec forbids starting a phase before the previous one passes its acceptance tests.
Phase 1 is split because its auth work is large and touches every client.

| Phase | Scope | Status |
|---|---|---|
| **0** | Requirements, architecture, API contracts, DB design | **Done (this document set)** |
| **1a** | Language packs registry, language/accessibility/voice preferences, settings UI | **Done**. See `phase-reports/PHASE_0_1A_REPORT.md` |
| **1b** | Real auth: JWT access + refresh rotation, guards on every route, device sessions, secure password reset; hardening; **E2EE messages** | **Done (2026-11-12)**. Remaining: SMS/email provider for OTP and verification |
| 1c | PostgreSQL adoption: run migrations, repository layer, data migration from JSON store (needs Postgres or Docker installed) | Planned |
| 1d | Flutter foundation (needs Flutter SDK installed) | Planned, blocked on tooling |
| 2 | Contact requests, blocking, voice messages, offline queue, notifications | **Blocking + voice messages done.** Remaining: contact requests, push notifications, offline queue |
| 3 | 1:1 WebRTC calls, call history, quality indicator; socket race fixed | **Done (prototype)**. Remaining: TURN, SFU, group calls |
| 4 | Offline ASR + live captions | **Done (prototype, web)**. Remaining: WER evaluation, multilingual, whisper.cpp/sherpa-onnx comparison, Android |
| 5 | ISL landmark extraction + isolated recognition | **Landmarks done; personal recogniser prototype.** A trained ISL model still needs licensed/consented data and experts |
| 6 | Continuous recognition, gloss → English, TTS | TTS done (web). Recognition/translation models not started |
| 7 | Verified human sign-video library, retrieval, playback | **Pipeline done; library empty.** Needs consented recordings from ISL signers + expert verification |
| 8 | Both translation directions inside calls | **Done (prototype)** within the limits above |
| 9 | ASL, BSL, Auslan packs | Planned |
| 10 | Security, performance, accessibility audit, deployment | Planned. Also: double ratchet (forward secrecy), encrypted attachments, Redis rate limits, TURN, external pentest |

### Phase 1a acceptance criteria (all met)

1. `GET /languages/sign` returns ISL, ASL, BSL, Auslan with no claimed AI capability (tested).
2. Preferences can be read and partially updated; invalid input returns 400 with every issue listed; a rejected update changes nothing (tested).
3. Preferences persist across a server restart (tested; this caught a store bug that dropped the field on load).
4. Web settings: every control saves, applies immediately, and survives reload (verified in Chrome, desktop and mobile).
5. Text size, high contrast, reduce motion and visual alerts visibly change the app (verified).
6. No control is non-functional. Sign-language choice is labelled as saved for future use, with no translation claimed.

### Phase 1b acceptance criteria (all met, 2026-11-12)

1. Every non-public REST route and the WebSocket handshake reject requests without a valid access token (API tests).
2. A user cannot read or modify another user's profile, preferences, chats or messages (API tests).
3. Access tokens expire in ≤15 min; refresh tokens rotate and a reused refresh token revokes the session family.
4. Device sessions list and revoke works.
5. Password reset requires proof of ownership (email or OTP), not just phone + name.
6. Web and admin clients work end to end with the new tokens.

Evidence: `apps/backend/test/security.test.ts` and `keys.test.ts` (criteria 1-5); `scripts/e2e-auth-test.mjs`
(12 checks), `e2e-e2ee-test.mjs` (8) and `e2e-voice-block-test.mjs` (7) in Chrome (criterion 6).
Criterion 5 uses a one-time code that is printed to the console in dev; production needs an SMS/email provider.
