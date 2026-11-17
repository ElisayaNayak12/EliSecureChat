# SignConnect AI / EliSecureChat — Security & Privacy Status

Current state as of 2026-11-12, measured against spec section 10. Every "Working" line is covered by an automated test
(backend API tests, web unit tests or browser end-to-end scripts in `scripts/`). Gaps are listed honestly.

| Requirement | Current state | Status |
|---|---|---|
| Password hashing | scrypt with a per-user salt, constant-time compare. Minimum 8 characters on sign-up | Working |
| Authentication on API routes | Global `AuthGuard`: every route needs a valid HS256 access token unless marked `@Public`. The token must belong to a live device session | Working |
| Object-level authorisation | Global `AccessGuard`: `userId`/`senderId`/`uploadedBy`/`requestedBy`/`ownerId` must be the caller; `chatId`/`messageId` must be a chat the caller belongs to. Multipart uploads check ownership in the handler. Other users only ever get a public profile (no email, no preferences) | Working |
| Access + refresh tokens | Access token 15 min, kept in memory only (never localStorage). Refresh token 30 days, 256-bit random, stored only as SHA-256, sent as an `httpOnly; SameSite=Strict` cookie (`Secure` behind HTTPS). Native clients get it in the body (`client: "native"`) | Working |
| Refresh rotation + reuse detection | Each refresh issues a new token. Reusing an old one revokes the whole session family | Working |
| Device sessions | List devices, sign out one device, sign out all others (Settings → Security). At most 10 live sessions per user | Working |
| Brute-force protection | Account lockout after 5 failed logins for 15 min. Auth endpoints limited to 20 requests/min per IP+path; everything else 600/min per IP | Working (in-memory, single server) |
| Password reset | One-time 6-digit code: hashed, 10-minute expiry, 5 attempts. Resetting revokes every session. **In dev the code is printed to the server console. In production the flow is disabled until an SMS/email provider is configured** | Working in dev. **Gap: no SMS provider** |
| Account verification | Sign-up proves the email (and phone, when SMS is configured) with one-time codes before an account exists. The phone must be a real mobile number (libphonenumber); the email domain must accept mail. Strong-password rules on sign-up, reset and change. New-device sign-in and password-change emails | Working (email needs SMTP settings; SMS needs a paid provider) |
| Change password | Requires the current password; signs out other devices | Working |
| Admin console | Separate admin session: random token stored hashed, 8 h expiry, sign-out. In production the console stays disabled unless `ADMIN_PASSWORD` has 12+ characters | Working |
| WebSocket | Handshake must carry a valid access token, otherwise `auth_error` + disconnect. Identity comes from the token, never from client payloads. CORS restricted to `ALLOWED_ORIGINS` | Working |
| Input validation | Global `ValidationPipe` (whitelist) active in dev and production. The dev server now runs compiled code. Message content capped at 64 KB, JSON bodies at 2 MB | Working |
| Security headers / CORS | `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`, `Cross-Origin-Resource-Policy same-site`, a Permissions-Policy, HSTS in production, no `X-Powered-By`. CORS allow-list via `ALLOWED_ORIGINS` | Working |
| File uploads | MIME + extension allow-list (HTML, SVG and scripts refused), 25 MB cap, random server-side names. Only the uploader, members of the chat it was sent in, or anyone (for avatars) can fetch it. Served with `nosniff`, a sandbox CSP and `attachment` disposition for non-media files | Working |
| **End-to-end encryption (messages)** | WebCrypto, per device. Non-extractable ECDH P-256 + ECDSA P-256 keys in IndexedDB. Each message gets a random AES-256-GCM key, sealed for every recipient device (and the sender's other devices) with ephemeral ECDH + HKDF-SHA256. The envelope is signed; the AAD binds chat, sender and device. The server stores and relays only envelopes (`e2e1:` prefix). 60-digit safety code to verify a contact; "security code changed" notice when keys change. A revoked device re-keys itself on next load and keeps its old keys locally to read earlier history | Working |
| E2EE limits | No double ratchet, so no forward secrecy or post-compromise security per message. **Attachments and voice-note audio are not E2EE** (they are access-controlled on the server; their captions are E2EE). A new device cannot read history sent before it existed. Messages from before E2EE remain readable by the server. Group key fan-out is per device, so it suits small groups | **Known limits** |
| Blocking | Per user. In 1:1 chats the server refuses messages (HTTP and socket) and call invites in both directions while a block exists | Working |
| Account recovery "AI verification" | The fake random face-match scores were **removed**. Requests now go to manual review (`NOT_AVAILABLE` + reviewer summary) | Fixed |
| Camera/mic AI processing | MediaPipe, Whisper and the personal recogniser run on the device. Only the resulting text is sent. Personal sign examples stay in IndexedDB as landmarks | Working |
| Secure model downloads | The hand model and published ISL ONNX models are verified by SHA-256 on load. Whisper relies on Transformers.js over HTTPS (no pinned hash) | Partial |
| WebRTC | 1:1 calls are DTLS-SRTP encrypted between the browsers; the server never sees media. Call signalling is authenticated and block-checked. **No TURN server**, so calls can fail behind strict NATs | Partial |
| Audit logging | Schema designed (`audit_logs`), not implemented | Gap |
| Data export & deletion | Self-delete suspends the account. No export | Partial |
| Storage | JSON file store with atomic writes. Not suitable for multiple server instances; PostgreSQL migration planned (Phase 1c) | Gap for production scale |

## Required production configuration

| Variable | Requirement |
|---|---|
| `NODE_ENV=production` | Turns on the production checks below |
| `JWT_SECRET` | 32+ random characters. **The server refuses to start without it** |
| `ADMIN_PASSWORD` | 12+ characters, otherwise the admin console is disabled |
| `ALLOWED_ORIGINS` | Comma-separated web origins (e.g. `https://chat.example.com`) |
| `TRUST_PROXY` | Set (e.g. `1`) when behind a reverse proxy, so rate limits see real client IPs |
| `RATE_LIMIT_PER_MIN`, `AUTH_RATE_LIMIT_PER_MIN`, `ADMIN_SESSION_HOURS`, `UPLOADS_DIR` | Optional overrides |

Serve only over HTTPS: refresh cookies are `Secure` in production and HSTS is sent.

## Before a public launch (not done)

- SMS/email OTP provider for password reset and phone verification.
- Shared rate limiting and sessions (Redis) and PostgreSQL, for running more than one server.
- TURN server for calls.
- A double ratchet (Signal protocol) for forward secrecy, plus encrypted attachments.
- Push notifications, audit logging, data export.
- External penetration test and a privacy policy / DPDP Act review.
