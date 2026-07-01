# EliSecureChat App (Runnable Full Stack)

This workspace is now fully runnable on desktop with:

- React web client (`apps/web`) for complete end-to-end testing
- NestJS backend (`apps/backend`) with REST + Socket.IO
- React Native mobile starter source (`apps/mobile`)
- Shared package (`packages/shared`)
- Master prompt/document files

## What Works Right Now

- Sign up
- Sign in
- Dev login (for quick testing)
- User search
- One-to-one chat creation
- Realtime messaging (Socket.IO namespace `/chat`)
- Typing indicator (realtime)
- Online/offline presence updates
- Delivery receipts (`sent` / `delivered` / `read`)
- Read receipts
- Chat summaries with unread counts
- Chat list online/last-seen status
- File and image attachments (up to 25MB)
- Reply messages
- Emoji reactions
- Pin and unpin messages
- Seen-by details (delivered/read users)
- Profile picture upload and profile update (settings tab)
- Mobile-optimized chat workflow with list/chat split behavior
- Message edit
- Delete request + approval flow
- Community creation/listing
- Persistent in-memory store snapshot to `apps/backend/data/store.json`
- Admin web mode with protected admin login, overview, users, chats, messages, communities, and delete requests

## Project Structure

- `apps/backend` - API + websocket gateway + in-memory runtime store
- `apps/web` - runnable frontend client
- `apps/mobile` - React Native starter source for Android app implementation
- `packages/shared` - common types
- `AI_PROMPTS.md` - all-in-one coding prompt

## Run The Complete App

1. Install all dependencies:

```bash
npm install
```

2. Start backend + web together:

```bash
npm run dev
```

Important: do not run only `npm run web:dev` if you want chat/auth to work.
If backend is down, UI now shows:
`Backend: offline (run npm run dev)`.

3. Open web app:

`http://localhost:5173`

Backend runs on:

`http://localhost:3000`

## Test With Two Users (Telegram-Style Flow)

1. Open `http://localhost:5173` in normal browser window.
2. Open the same URL in Incognito/Private window.
3. In window 1, sign up user 1 (`9000000001`, password `secret123`).
4. In window 2, sign up user 2 (`9000000002`, password `secret123`).
5. In window 1, search user 2 and click `Chat`.
6. In window 2, click `Refresh` in chats and open the same chat.
7. Send messages from both windows and verify realtime updates.
8. Verify typing indicator: start typing in one window and watch the other.
9. Verify unread badge in chat list updates when other user sends message.
10. Verify delivery/read states on sender bubbles (`sent`, `delivered`, `read`).
11. Click `Attach` to send an image/file and verify it appears on both sides.
12. Verify read receipts after opening the chat on the second user side.
13. Try edit message, delete request, and approve from the other user.
14. Use `Reply`, `Pin`, `Seen By`, and emoji reaction actions on message bubbles.
15. Go to `Security` tab and upload profile image, then verify avatar appears in chat/search lists.

## Admin Web App

1. In app header, switch to `Admin Web`.
2. Login with default credentials:
   - username: `admin`
   - password: `admin123`
3. Click `Refresh` and switch admin tabs to see:
   - all users
   - all chats
   - all messages
   - all communities
   - all delete requests

You can change admin credentials via backend env values in:
`apps/backend/.env.example`

## Build Checks

```bash
npm run backend:build
npm run web:build
```

## Smoke Test

Run a one-command backend runtime verification:

```bash
npm run smoke:test
```

The smoke test runs against an isolated backend port (`3302`) so it does not conflict with local dev sessions.

## Automated Two-User Realtime Test

This script starts backend, creates two users, verifies typing/presence/message flow,
checks delivery + read receipts, verifies reply + reaction + pin/unpin metadata,
uploads a file, and verifies attachment persistence.

```bash
npm run backend:build
npm run realtime:test
```

The realtime test runs against an isolated backend port (`3301`) to avoid collisions with `npm run dev`.

## Mobile

The mobile source in `apps/mobile/src` is ready to integrate into a React Native
CLI project. It mirrors the same flows as the web app and includes placeholders
for biometric and secure-screen native hooks.

## Important Security Note

Current encryption is placeholder (base64 for demo/testing flow only). Before any
production usage, replace it with proper end-to-end encryption (for example
libsignal), keep private keys only on device secure storage, and add certificate
pinning + device integrity checks.
