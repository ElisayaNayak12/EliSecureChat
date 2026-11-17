# SignConnect AI — API Documentation

Base URL: `http://localhost:3000` (the web dev server proxies it as `/api`).
JSON in, JSON out.

## Authentication (all routes)

Every route requires `Authorization: Bearer <accessToken>` unless marked **public**. Media URLs (`/uploads/...`,
sign-video files) also accept `?access_token=`. The WebSocket connects with `auth: { token }`; an invalid token gets
`auth_error` and a disconnect. A user can only act as themselves (`userId`, `senderId`, ... must be the caller) and
only in chats they belong to. Otherwise the response is `403`. Other users are returned as public profiles
(id, name, avatar, status, no email or preferences).

Errors: `401 UNAUTHENTICATED` / `SESSION_EXPIRED` (refresh and retry), `403 FORBIDDEN`, `429 TOO_MANY_REQUESTS`
(auth endpoints 20/min per IP, others 600/min).

### `POST /auth/sign-up` (public) · `POST /auth/sign-in` (public)
Sign-up body: `{ name, phone, password (8-128), email?, client? }`. Sign-in body: `{ phone, password, client? }`.
Response: `{ user, accessToken, expiresIn: 900, sessionId, tokenType: "Bearer" }`. The refresh token is set as
the `sc_refresh` httpOnly cookie. With `client: "native"`, `refreshToken` is returned in the body instead.
After 5 failed sign-ins: `401 TOO_MANY_ATTEMPTS` for 15 minutes. Suspended account: `403 ACCOUNT_SUSPENDED`.

### `POST /auth/refresh` (public)
Uses the cookie, or `{ client: "native", refreshToken }`. Returns a new access token and **rotates** the refresh
token. A reused (already rotated) token revokes the whole session: `401 SESSION_REVOKED_FOR_SECURITY`.

### `POST /auth/logout` (public)
Revokes the current session and clears the cookie.

### `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/sessions/revoke-others`
List live device sessions `[{ id, device, createdAt, lastUsedAt, current }]`, sign one out, or sign out every
other device.

### `POST /auth/change-password`
`{ currentPassword, newPassword }`. Signs out every other session. `401 WRONG_PASSWORD`.

### `POST /auth/password-reset/request` (public) · `POST /auth/password-reset/confirm` (public)
Request: `{ phone }`. The response is always the same, whether or not the number is registered. A 6-digit code is
sent (dev: printed in the server console; production without an SMS provider: `503`).
Confirm: `{ phone, code, newPassword }`. The code expires after 10 minutes and allows 5 attempts. Errors:
`INVALID_CODE` / `CODE_EXPIRED` / `TOO_MANY_ATTEMPTS`. Success revokes every session.

### `POST /auth/admin/sign-in` (public) · `POST /auth/admin/sign-out`
Admin console session (`x-admin-token`, 8 h). In production it is disabled unless `ADMIN_PASSWORD` has 12+ characters.

## End-to-end encryption key directory

Keys are raw uncompressed P-256 public keys, base64-encoded. Private keys never leave the device.

### `POST /keys/devices`
`{ deviceId, agreementKey, signingKey, label? }` registers this device's public keys. Keys are immutable per
`deviceId` (`409 DEVICE_KEYS_ARE_IMMUTABLE`). A user can have at most 10 active devices; the least recently seen
are revoked.

### `GET /keys/chats/:chatId` (members only) · `GET /keys/users/:userId`
`[{ userId, deviceId, agreementKey, signingKey, label, createdAt, lastSeenAt, revoked }]`. `revoked` is also true
after 30 days of inactivity. Clients encrypt only to non-revoked devices.

### `DELETE /keys/devices/:deviceId`
Revokes one of your own devices.

Message `encryptedContent` is an `e2e1:` envelope (a JSON envelope: per-device sealed AES-256-GCM key, ciphertext,
ECDSA signature). The server never sees the plaintext. The 64 KB content limit applies.

## Blocking

### `GET /users/:userId/blocks` · `POST /users/:userId/blocks` `{ targetId }` · `DELETE /users/:userId/blocks/:targetId`
Returns `{ ok, blocked: string[] }`. While either person blocks the other, 1:1 messages (HTTP and socket) and call
invites are refused with `403 BLOCKED` (socket ack `{ ok: false, error: "BLOCKED" }`, call end reason `BLOCKED`).

## Messages (changes)

- Edit: sender only, within 15 minutes, not for SYSTEM messages.
- A delete request cannot be approved by the person who made it.
- `messageType: "AUDIO"` is used for voice messages; the audio file is uploaded through `/uploads` and access-controlled.

## Uploads

### `POST /uploads` (multipart `file`)
Max 25 MB. Images, audio, video, PDF and office/text files are allowed; HTML, SVG and scripts are refused.
Returns `{ url, fileName, mimeType, fileSize }`. `GET /uploads/:name?access_token=` serves the file only to the
uploader, members of a chat where it was sent, or anyone if it is an avatar.

## Sign-language packs

### `GET /languages/sign`
Lists every registered sign-language pack. Packs are **metadata only**: for every pack,
`recognitionModel`, `translationModel` and `modelVersion` are `null`, and `videoLibrary.verifiedClipCount` and
`vocabulary.glossCount` are `0`. Clients must treat a `null` model as "translation unavailable".

```json
[
  {
    "id": "isl", "code": "ISL", "name": "Indian Sign Language", "region": "India",
    "pairedSpokenLanguages": ["en-IN", "hi-IN"],
    "lifecycle": "IN_DEVELOPMENT", "roadmapPhase": 5,
    "metadata": { "description": "...", "writtenGlossConvention": null },
    "vocabulary": { "glossCount": 0, "status": "NOT_IMPLEMENTED" },
    "grammarRules": { "status": "NOT_IMPLEMENTED", "notes": "..." },
    "recognitionModel": null, "translationModel": null,
    "videoLibrary": { "verifiedClipCount": 0, "sentenceLevelClipCount": 0, "status": "NOT_IMPLEMENTED" },
    "datasetReferences": [{ "name": "iSign", "licenseReview": "NOT_REVIEWED", "notes": "..." }],
    "modelVersion": null,
    "evaluation": { "glossErrorRate": null, "recognitionAccuracy": null, "signerIndependent": false, "status": "NOT_IMPLEMENTED" },
    "license": { "packLicense": null, "provenance": "..." }
  }
]
```

### `GET /languages/sign/:id`
One pack. `404 {"message":"SIGN_LANGUAGE_NOT_FOUND"}` if unknown.

### `GET /languages/spoken`
`[{ "id": "en-IN", "name": "English (India)" }, ...]`. Currently `en-IN`, `en-US`, `en-GB`, `en-AU` and `hi-IN`.

## User preferences

### `GET /users/:userId/preferences`
Returns the full preferences object. Users created before Phase 1a get defaults.

```json
{
  "preferredLanguage": "en-IN",
  "preferredSignLanguage": null,
  "accessibility": { "textSize": "default", "highContrast": false, "reduceMotion": false, "visualAlerts": false },
  "voice": { "voiceName": null, "speakingRate": 1 },
  "theme": "system",
  "updatedAt": null
}
```

`404 USER_NOT_FOUND` if the user does not exist.

### `PATCH /users/:userId/preferences`
Partial update. Send only the fields you are changing; nested objects merge.

```json
{ "preferredSignLanguage": "isl", "accessibility": { "textSize": "large" } }
```

| Field | Rule |
|---|---|
| `preferredLanguage` | One of `GET /languages/spoken` ids |
| `preferredSignLanguage` | A pack id from `GET /languages/sign`, or `null` |
| `accessibility.textSize` | `default` \| `large` \| `x-large` |
| `accessibility.highContrast`, `.reduceMotion`, `.visualAlerts` | boolean |
| `voice.voiceName` | `null` or a 1–200 character string (a device-local voice name) |
| `voice.speakingRate` | number 0.5–2.0 (rounded to 2 decimals) |
| `theme` | `system` \| `light` \| `dark` (`system` = no explicit choice) |

- **200:** the full updated preferences, with `updatedAt` set.
- **400:** `{ "error": "INVALID_PREFERENCES", "issues": ["...", "..."] }` lists every problem. Unknown fields are rejected, not ignored. Nothing is saved when any issue exists.
- **404:** `USER_NOT_FOUND`.

## Tests
`npm --workspace @secure-chat/backend test` (see `apps/backend/test/api.test.ts`).

---

## Calls (Socket.IO namespace `/chat`)

The client must `register_presence` first. The acting user is taken from that registration, **not** from event payloads.
All events use acknowledgements (`{ ok: boolean, error?: string }`).

| Client → server | Payload | Notes |
|---|---|---|
| `call:invite` | `{ chatId, media: "VIDEO" \| "AUDIO" }` | 1:1 chats only. Errors: `CHAT_NOT_FOUND`, `GROUP_CALLS_NOT_SUPPORTED`, `PEER_OFFLINE`, `BUSY` |
| `call:accept` | `{ callId }` | Callee only, while ringing |
| `call:decline` / `call:end` | `{ callId }` | Either participant |
| `call:signal` | `{ callId, data }` where `data` = `{type:"offer"\|"answer", sdp}` or `{type:"ice", candidate}` | Only while ACTIVE; relayed to the peer |
| `call:translation` | `{ callId, payload }`, see below | Only while ACTIVE; text produced on the sender's device |

| Server → client | Payload |
|---|---|
| `call:incoming` | `{ callId, chatId, media, from: { id, name, avatarUrl } }` |
| `call:accepted` | `{ callId }` |
| `call:ended` | `{ callId, status, reason }`. Reasons: `HANGUP`, `DECLINED`, `NO_ANSWER`, `CANCELLED`, `DISCONNECTED`, `ANSWERED_ELSEWHERE` |
| `call:signal` | `{ callId, from, data }` |
| `call:translation` | `{ callId, from, payload, at }` |

Translation payload: `{ source: "speech"|"sign"|"typed", text (1–500), final, confidence: 0..1|null, gloss?: string[], language, engine, corrected? }`.
Ring timeout: `CALL_RING_TIMEOUT_MS` (default 45 s).

### `GET /calls?userId=`
The user's last 100 calls, newest first (`status`, `startedAt`, `answeredAt`, `endedAt`, `aiAssistUsed`).

## Human sign-video library

### `POST /sign-videos` (multipart)
Fields: `file` (mp4/webm/mov, ≤50 MB), `signLanguageId`, `unit` (SENTENCE|PHRASE|SIGN), `phraseText`, `gloss`, `meaning`,
`signerId`, `region?`, `quality`, `license`, `provenance`, `consentConfirmed=true`, `uploadedBy`.
- **201:** the video, `verificationStatus: "UNVERIFIED"`, with its SHA-256.
- **400:** `{ error: "INVALID_SIGN_VIDEO", issues: [...] }`.

### `GET /sign-videos?language=` / `GET /sign-videos?uploadedBy=`
Verified videos for a language, or one contributor's own uploads (any status).

### `GET /sign-videos/lookup?language=&text=`
`{ match, reason }`. Matches only a **VERIFIED** clip whose normalised phrase equals the whole normalised text (case and punctuation ignored).
Reasons: `EXACT_VERIFIED_MATCH`, `NO_VERIFIED_VIDEO_FOR_SENTENCE`, `LANGUAGE_HAS_NO_VERIFIED_VIDEOS`, `EMPTY_TEXT`. Clips are never concatenated.

### `GET /sign-videos/:id/file`
Streams the video if VERIFIED. Admins can pass `?adminToken=` and the uploader `?uploadedBy=`. Otherwise **403**.

### Admin (`x-admin-token` header)
- `GET /admin/sign-videos`
- `PATCH /admin/sign-videos/:id`, body `{ status: VERIFIED|REJECTED|UNVERIFIED, note? }`
- `DELETE /admin/sign-videos/:id`
