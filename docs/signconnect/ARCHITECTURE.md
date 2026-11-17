# SignConnect AI — Architecture

## Current system (as built)

```
apps/web (React 19 + Vite, :5173)  ──┐  REST /api/*   ┌─ apps/backend (NestJS, :3000)
apps/admin (React 19 + Vite, :5174) ─┤  Socket.IO     │   modules: auth, users, chats, messages,
                                      └───────────────►│   communities, uploads, admin, languages
                                                       │   store: JSON file (data/store.json)
                                                       └─ uploads: local disk
```

## Target system (spec sections 3, 4, 8)

```
 Clients (primary AI inference ON DEVICE)
 ├─ Web: React + MediaPipe Tasks + ONNX Runtime Web (WASM/WebGPU) + IndexedDB model store
 └─ Android: Flutter + MediaPipe + LiteRT/ONNX Runtime Mobile (platform channels / FFI)
        │ REST + WebSocket                    │ WebRTC media
        ▼                                     ▼
 NestJS modular backend                 LiveKit SFU + STUN/TURN
 ├─ identity / users / contacts / chat / calls
 ├─ translation coordination (sessions, feedback; never raw media)
 ├─ model registry (versions, checksums, signatures)
 ├─ media (S3-compatible object storage)
 ├─ notifications / administration / audit
        │
        ▼
 PostgreSQL · Redis · S3-compatible storage

 Offline, separate from the product runtime:
 ai/ (Python, FastAPI for experiments only): datasets → landmark extraction → training →
 evaluation → export/quantise → signed model artefacts → model registry
```

### Translation pipelines (spec section 1)

- **Hearing → Deaf:** mic → on-device ASR → sentence finalisation → language-specific translation → retrieve a
  *verified human* sentence/phrase video for the recipient's sign language → play beside the call, with captions.
  If no validated video exists: show the text with a clear "no verified signing available" message. Never
  stitch unvalidated clips together.
- **Deaf → Hearing:** camera → on-device MediaPipe landmarks → recognition model → gloss sequence →
  translation → English text → on-device TTS → text + voice to the peer. Low-confidence output is shown as
  uncertain and the user can correct it. It is never silently guessed.

## Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Build SignConnect inside the existing ELiSecureChat monorepo | Spec §11 allows it; working chat and calls already exist |
| D2 | Keep **React + Vite** for web instead of migrating to Next.js | The app is a client-heavy SPA with local inference; SSR adds little. Revisit if SEO or server rendering becomes a requirement |
| D3 | Keep the custom CSS design system (AURA + Verdant) instead of Tailwind | Fully built, themed and accessible already; rewriting would add risk with no user benefit |
| D4 | Modular NestJS monolith first; extract services later | Spec §8: no unnecessary distributed infrastructure early |
| D5 | Language packs live in a backend registry (`apps/backend/src/languages`), served at `/languages/*` | One source of truth; clients never hard-code pack capabilities |
| D6 | Preference validation is a pure function, not a class-validator DTO | The dev server (tsx) cannot run DTO validation; this works in every mode and is unit-testable |
| D7 | Voice preview uses the browser's **local** `speechSynthesis` voices only (`localService === true`) | Meets the local-inference rule today. Replace with a bundled TTS model in Phase 6 |
| D8 | PostgreSQL schema designed now; adoption deferred to Phase 1c | Postgres and Docker are not installed on the dev machine; designing early keeps the JSON store compatible |
| D9 | Test runner: Node's built-in `node:test` via `tsx` | No new framework dependency; fast; runs TypeScript directly |

## Repository layout

Existing (kept):

```
apps/backend  apps/web  apps/admin  apps/mobile (placeholder)  packages/shared  scripts/
```

Added for SignConnect:

```
docs/signconnect/                 architecture, roadmap, DB, API, AI, datasets, security, reports
infrastructure/database/migrations/   PostgreSQL schema (not yet executed)
apps/backend/src/languages/       sign-language pack registry + API
apps/backend/test/                backend tests (node:test)
```

Planned (created when their phase starts, not as empty folders): `ai/` (datasets, preprocessing,
landmark-extraction, recognition, translation, speech-to-text, text-to-speech, sign-video-retrieval,
training, evaluation, model-export), `infrastructure/docker`, `infrastructure/livekit`, `infrastructure/turn`.
Model binaries are never committed to Git.
