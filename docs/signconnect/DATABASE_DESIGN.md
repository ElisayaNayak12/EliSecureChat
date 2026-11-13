# SignConnect AI — Database Design

**Status:** the schema is designed but **not yet executed**. PostgreSQL is not installed on the development
machine. The running app still uses the JSON file store (`apps/backend/data/store.json`). Adoption is Phase 1c.

Migration: [`infrastructure/database/migrations/0001_signconnect_initial_schema.sql`](../../infrastructure/database/migrations/0001_signconnect_initial_schema.sql)

## Principles (spec section 9)

- UUID primary keys (`gen_random_uuid()`); `audit_logs` uses a bigint identity for append-only volume.
- Foreign keys with explicit deletion rules: `CASCADE` for owned data, `SET NULL` to keep history, and `RESTRICT` where deleting would orphan provenance (models in use, consents behind videos).
- `created_at` everywhere and `updated_at` plus a trigger on mutable tables.
- **Original and translated content are separate:** `messages.body` holds only what the sender wrote; machine translations go to `message_translations` with confidence and the session or model that produced them.
- **No raw media in Postgres:** `attachments.storage_key`, `sign_video_assets.storage_key` and `model_versions.artifact_key` point to object storage.

## Tables

| Group | Tables |
|---|---|
| Identity | `users`, `user_profiles`, `devices`, `user_languages`, `user_consents` |
| Languages | `sign_languages` |
| Messaging | `conversations`, `conversation_members`, `messages`, `message_receipts`, `message_reactions`, `attachments` |
| Calls | `calls`, `call_participants` |
| AI | `model_versions`, `model_language_support`, `device_model_installs`, `translation_sessions`, `message_translations`, `sign_video_assets`, `sign_video_metadata`, `translation_feedback` |
| Ops | `notifications`, `audit_logs` |

All 21 tables named in spec section 9 are present. Three extra tables (`message_receipts`, `message_reactions`, `message_translations`) normalise data the current JSON store keeps as arrays.

## Key design notes

- **`user_profiles`** holds the Phase 1a preferences as typed columns with CHECK constraints that match the API validation in `apps/backend/src/users/preferences.ts`.
- **`devices`** carries the refresh-token hash and a `refresh_family` id, so Phase 1b can rotate refresh tokens and revoke a whole family when a token is reused.
- **`model_versions`** requires `sha256`, `signature`, `license` and `provenance`. No model can be registered without them (spec sections 4 and 6).
- **`sign_video_assets` / `sign_video_metadata`** carry every field spec §5.6 lists (language, gloss, meaning, phrase, signer, region, duration, quality, verification, licence, provenance). `consent_id` links each clip to the signer's consent record. Only `VERIFIED` clips are indexed for retrieval.
- **`device_model_installs.previous_model_version_id`** supports rollback.

## Mapping from the current JSON store (for the Phase 1c data migration)

| JSON store | PostgreSQL |
|---|---|
| `users[]` (name, avatarUrl, preferences) | `users` + `user_profiles` |
| `chats[]` (`ONE_TO_ONE` / `COMMUNITY`, `memberIds[]`) | `conversations` (`DIRECT` / `GROUP`) + `conversation_members` |
| `communities[]` | `conversations` (GROUP) plus a `communities` table to be added in Phase 2 (privacy, invite code) |
| `messages[].encryptedContent` | `messages.body` (it is Base64 text today, not ciphertext) |
| `messages[].readBy[]` / `deliveredTo[]` | `message_receipts` |
| `messages[].reactions[]` | `message_reactions` |
| `messages[].attachmentUrl` | `attachments.storage_key` |
| `deleteRequests[]`, `recoveryRequests[]` | Phase 2 / 1b tables (not in 0001) |
