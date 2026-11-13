# Changelog — SignConnect AI

## 2026-11-13 — Real-hand fingerspelling in calls + premium call screen

### Added
- **Speech to fingerspelling for the Deaf person.**
  - What the hearing person says is shown in real time as real hand photos, letter by letter, in the Deaf person's own sign language: ISL two-handed alphabet plus numbers 1–9, or ASL one-handed alphabet. Speech comes from captions; typed text works too.
  - The player shows a big photo, the word strip, and the sentence with the current word highlighted.
  - Controls: Slow, Normal or Fast speed, Pause and Replay.
  - Double letters get an "again" badge.
  - If more than two sentences are waiting, the player jumps to the latest so it keeps up with the call.
  - Words that cannot be spelled honestly are shown as text, never guessed: other scripts, and digits with no photo.
  - A verified human sign video still takes priority when one exists for the exact sentence.
- **"What Asha sees" for the hearing person.**
  - A live preview of exactly the signs being shown.
  - The heard caption is displayed, and **Fix** resends a corrected sentence, marked "corrected" on the Deaf side.
- **Automatic setup.**
  - Each side shares its sign language when the call connects (`call:profile` socket event, validated).
  - A hearing person calling a signer gets speech captions switched on automatically.
- **Premium call screen** (approved design):
  - Full-bleed video stage with a gold-edged self-view.
  - Frosted-glass captions over the video.
  - Dark panel with gold accents.
  - Line-icon control bar.
  - The signing player stays pinned and visible.
- **61 hand photos** under `apps/web/public/signs/`: 35 ISL, 26 ASL. See DATASET_LICENSES.md; usage rights still need confirming.
- **Tests:**
  - Web: `fingerspell.test.ts` (6 tests; web total 27). It includes a check that every letter has a photo.
  - Backend: profile relay checks added (71 in total).
  - Browser: two-browser call test `scripts/e2e-fingerspell-call-test.mjs` (13 checks).

## 2026-11-13 — Verified accounts (like WhatsApp/Telegram)

### Added
- **Verified sign-up:**
  - Inputs:
    - Name.
    - Mobile number: country picker, validated against Google's libphonenumber numbering plans, mobiles only.
    - Email: required; typo suggestions ("gmial.com"), throwaway domains refused, DNS check that the domain receives mail.
    - Strong password: 8+ characters, letters and numbers, not common, not your name/phone/email; strength meter and rule checklist.
  - 6-digit codes by email (and SMS when configured). The account exists only after verification.
  - Codes: hashed, 10 minutes, 5 tries, 60 s resend cooldown, 6 per address/number per hour.
- **Emails:** verification, welcome, password reset, password changed, new-device sign-in.
  - Table-based HTML with inline styles (Gmail/Outlook safe) and a plain-text version.
  - Sent through any SMTP server (free with a Gmail App Password).
- **SMS** through Twilio when configured (India: DLT registration needed). In dev, emails and SMS go to `apps/backend/data/outbox/`.
- **Sign in** with phone (any format) or email.
- **Forgot password** by Email or SMS, then a strong new password. All devices are signed out and a confirmation email is sent.
- `GET /auth/options`; `POST /auth/sign-up/start|resend|verify`; reset endpoints accept `identifier` + `channel`.
- Production: direct unverified `/auth/sign-up` is disabled; sign-up reports 503 until email is configured.
- Flutter Android app: same sign-up verification and forgot-password screens.
- Backend reads optional `apps/backend/.env`.
- Tests: `test/verification.test.ts` (9 tests; backend total 70). Browser e2e `scripts/e2e-signup-test.mjs` (15 checks).

### Changed
- **Email-only for now:** SMS is off unless an SMS provider is configured (it is not free), so no SMS option or
  "we will text you" text is shown. The SMS code path stays dormant and tested (simulated provider).

### Fixed
- The sign-in field accepted at most 20 characters, which blocked email sign-in. Caught by the browser test.
- The suspended-account screen still claimed an "AI agent" verifies identity; it now says requests are reviewed manually.
- Avatars showed "A(" for names like "Asha (Deaf, ISL)".

## 2026-11-12 — Real authentication, hardening, end-to-end encryption, blocking, voice messages

### Security
- **Real authentication:**
  - 15-minute HS256 access tokens, kept in memory on the client.
  - 30-day refresh tokens in an httpOnly SameSite=Strict cookie, stored hashed, rotated on every use; reuse revokes the whole family.
  - Device sessions (list / sign out one / sign out others), at most 10 per user.
  - Lockout after 5 failed logins.
  - Change password.
  - OTP password reset (dev: code printed in the server console; production: disabled until an SMS provider is configured).
  - Removed: `dev-login`, and the reset by phone + name.
- **Guards on every route:** `AuthGuard` (token + live session) and `AccessGuard` (the caller can only act as themselves and only in their own chats).
  - Fixed leaks: `GET /chats` returned every chat; other users' email and preferences were exposed; any member could edit any message; requesters could approve their own delete requests.
- **WebSocket handshake authenticated.** Identity comes from the token, never from payloads.
- **Hardening:**
  - Rate limiting (auth 20/min, general 600/min).
  - Security headers, CORS allow-list (`ALLOWED_ORIGINS`), 64 KB message cap.
  - `ValidationPipe` now active in dev (the dev server runs compiled code; `start:dev:fast` keeps tsx).
- **Uploads:**
  - Allow-list; HTML, SVG and JS refused.
  - Random names, ownership registry; only the owner, chat members or avatar viewers can fetch a file.
  - Sandbox CSP, attachment disposition for non-media files.
- **Admin:**
  - Hashed 8-hour sessions with sign-out; the login form is no longer pre-filled.
  - In production, disabled unless `ADMIN_PASSWORD` has 12+ characters.
  - The sign-video file route no longer trusts `?uploadedBy=`.
- **Fake account-recovery "AI verification" removed:** no random scores; requests go to manual review.

### Added
- **End-to-end encrypted messages (WebCrypto):**
  - Per-device P-256 keys.
  - AES-256-GCM content key sealed per device; signed envelopes.
  - Safety codes and "security code changed" notices.
  - Key directory API (`/keys/*`).
  - The server stores only `e2e1:` envelopes.
  - See SECURITY.md for the limits (no ratchet, attachments not E2EE).
- **Blocking:** the server refuses messages and calls in 1:1 chats; the UI shows a blocked banner and an unblock button.
- **Voice messages:** record / cancel / send, max 5 min, Opus WebM; plays inline; caption E2EE.
- **Settings → Security:** devices, sign-out, change password.
- New tests:
  - Backend: `security.test.ts`, `keys.test.ts` (61 backend tests in total).
  - Web: crypto envelope tests and a slow-device segmentation test (21 web tests).
  - e2e scripts: `scripts/e2e-auth-test.mjs` (12 checks), `e2e-e2ee-test.mjs` (8), `e2e-voice-block-test.mjs` (7).

### Fixed
- A socket send refused by the server (`ok:false`) was silently dropped; the user now sees why.
- The vision model warm-up blocked the main thread right after sign-in and delayed incoming-call rings. It now starts 5 s after sign-in when the browser is idle, and never during a call.
- **Sign segmentation counted frames, not time.** On slow devices (about 4 fps) consecutive signs merged or were dropped. The trained ISL model then recognised only 0-1 of 4 signs in a call. Segmentation now uses elapsed time (same thresholds as 20 fps) and has a slow-device regression test.
- **The chat behind a call re-rendered constantly** (every call-stats tick, caption and sign result), and the 1.7 s / 2.5 s polls replaced state even when nothing had changed:
  - Call updates now re-render only the call layer.
  - Polls keep the existing state when the data is unchanged.
  - The open-chat poll pauses during calls; the socket still delivers live messages.
  - Long chats render the latest 150 messages, with "Show earlier messages".
- **Decrypted text could stay at "Decrypting…"** until another update arrived: the message view did not recompute when background decryption finished. Constant polling had hidden this.
- **A revoked device (remote sign-out or the 10-device limit) broke encryption on that browser permanently.** It now re-keys automatically with a new device id, and contacts see "security code changed". The old keys stay on the device so earlier history remains readable. New e2e test: `scripts/e2e-rekey-test.mjs` (6 checks).

## 2026-11-10 — ISL dataset collection + training pipeline + on-device model

### Added
- **Consent-based dataset collection** (Translator page):
  - Signers give consent covering both recording and training, and are stored under pseudonymous ids.
  - Recordings are landmarks only (never video), labelled from a vocabulary of 30 starter words.
  - The page shows progress per word.
  - Withdrawing consent deletes that signer's recordings.
- **Admin "Sign dataset" tab:**
  - Statistics and vocabulary management.
  - Review with an animated hand-skeleton preview; approve, reject, delete, approve-all.
  - Export for training.
- **Python training pipeline** (`ai/signconnect_ai`, PyTorch 2.14 CPU):
  - Features ported exactly from the app, with a parity test.
  - Signer-independent splits.
  - BiGRU vs temporal CNN, keeping the better one.
  - Confidence-threshold calibration (floor 0.6).
  - ONNX export checked against PyTorch with onnxruntime.
  - Output: manifest with honest metrics, metrics.json and a report.
- **Model registry:**
  - Admin "Sign models" tab: upload model.onnx + manifest.json (both validated), SHA-256 recorded.
  - One published model per language; rollback and withdraw.
- **On-device inference** (`apps/web/src/ai/islModel.ts`, ONNX Runtime Web WASM):
  - The download is verified by SHA-256.
  - In calls the published model is tried first; uncertain results are not sent, and personal signs act as a fallback.
  - Built-in gestures can be switched off in the call.
- **Tests:**
  - Backend: 38 tests, including dataset and model registry.
  - Python: 8 tests (parity, signer split, end-to-end training on synthetic data).
  - New full-loop e2e (`scripts/e2e-isl-loop-test.mjs`): consent → UI recording → approval → export → training → publish → live recognition in a call → cleanup.
- JSON body limit raised to 2 MB, via `app-setup.ts` shared by the server and the tests.

### Fixed (found by the end-to-end tests)
- **Trainer kept an under-trained checkpoint** when validation accuracy hit 100% in the first epoch. The resulting threshold (0.95) rejected every sign live. Ties are now broken by validation loss, between epochs and between architectures. If the target accuracy is unreachable, calibration picks the best trade-off instead of rejecting everything, and the report warns about low coverage. A regression test covers this.
- **Confidence threshold now has a floor of 0.6**, so random movements are not accepted.
- **Gesture debouncing is now time-based** (0.4 s hold, at least 3 frames) instead of counting 8 frames, so slow devices behave like fast ones. In-browser checks with the CPU slowed 4×: 4 of 5 runs passed.
- **The language registry now reports a published model and verified videos live.** Settings shows the real state.

## 2026-11-10 — Live hand-gesture detection in calls

### Added
- Vision model switched to the **MediaPipe Gesture Recognizer** (Apache-2.0, pinned SHA-256 `97952348…0482`). It gives hand landmarks plus 7 pretrained gestures: 👍 👎 ✋ ✊ ☝️ ✌️ 🤟.
- In calls, detection turns on automatically for users with a sign language set. Confident results (≥70%) are sent to the other person automatically as text and read aloud there. Lower-confidence results wait for confirmation. Every sent result has a "Correct" option, and corrections are marked.
- A live badge on the signer's own video shows what the model sees right now (gesture and confidence, or hand count). The hearing person's caption is marked "(signing)".
- Translator page: a live gesture readout, gestures included in the recognition test, and an editor for each gesture's English text (empty = off).
- The vision model preloads and warms up after sign-in for signers. Detection is live about 0.3 s after a call connects (was 7+ s).
- Tests: web 14 (adds gesture debouncing). New e2e `scripts/e2e-gesture-test.mjs`: 9/9, using real hand photos as the camera during a live call.

## 2026-11-10 — Calls with sign-language assistance (Phases 3, 4, 7, 8 prototypes)

### Added
- Real 1:1 WebRTC video/audio calls replacing the old simulated call (which never sent media): signalling via Socket.IO, call history, ring timeout, busy/offline handling, network-quality indicator, camera switching.
- In-call translation panel. Remote and local video tiles are equal size. Features: live captions (on-device Whisper), personal sign recognition (on-device MediaPipe + DTW) with confirm/correct before sending, verified human signing-video playback with replay and speed control, reading incoming signs aloud, typed captions, per-feature on/off.
- Translator page (Sign Studio): model downloads with checksum verification, recording personal signs, recognition test, caption test, and contributing signing videos (file or camera).
- Backend sign-video library with admin review. Admin console "Sign videos" tab.
- Tests: backend 30 (now including call signalling over real sockets and the sign-video rules), web 8 (recogniser algorithm), plus a two-browser end-to-end script (`scripts/e2e-call-test.mjs`, 13 checks).

### Fixed
- "Chat opened, sync failed: socket has been disconnected": switching chats no longer drops the socket, and presence and rooms are re-registered after any reconnect.

## 2026-11-10 — Phase 0 + Phase 1a

### Added
- Phase 0 documentation set in `docs/signconnect/` (architecture, roadmap and gap analysis, database design, API, AI plan, dataset licences, security).
- PostgreSQL target schema `infrastructure/database/migrations/0001_signconnect_initial_schema.sql` (designed, not yet executed).
- Backend `languages` module: `GET /languages/sign`, `GET /languages/sign/:id`, `GET /languages/spoken`, serving a metadata-only registry for ISL, ASL, BSL and Auslan.
- Backend user preferences: `GET` / `PATCH /users/:userId/preferences`, with strict validation (unknown fields rejected, every issue reported).
- Backend test suite (`npm --workspace @secure-chat/backend test`): 21 tests across unit and HTTP API.
- Web Settings sections: Language, Sign language, Accessibility (text size, high contrast, reduce motion, visual alerts) and Voice (device-local voice, speaking speed, sample playback).
- App-wide accessibility hooks (`apps/web/src/accessibility.css`, `preferences.ts`), plus a visual flash on incoming messages when enabled.

### Fixed
- `InMemoryStore.load()` dropped unknown user fields, so preferences would have been lost on every restart.
- A saved preference no longer forces the dark theme: the default theme is now `system`.

### Changed (honesty, spec §10/§13)
- Removed false end-to-end-encryption claims from Settings, the conversation info panel, the empty-chat text and the sign-in page.
