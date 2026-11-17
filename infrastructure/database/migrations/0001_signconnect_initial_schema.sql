-- SignConnect AI: initial PostgreSQL schema (spec section 9)
-- Status: DESIGNED, NOT YET EXECUTED. PostgreSQL is not installed on the dev machine (2026-11-10).
-- Target: PostgreSQL 15+. Adoption is planned for Phase 1c (see docs/signconnect/DEVELOPMENT_ROADMAP.md).
--
-- Rules applied:
--  * UUID primary keys (gen_random_uuid, pgcrypto).
--  * created_at / updated_at timestamps on mutable tables.
--  * Original and translated message content are stored separately (messages vs. message_translations).
--  * No raw audio/video in the database: attachments and sign videos hold object-storage keys only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text UNIQUE,
  email           citext UNIQUE,
  email_verified_at timestamptz,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'LANGUAGE_EXPERT')),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  suspension_reason text,
  suspended_at    timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sign_languages (
  id              text PRIMARY KEY,                -- 'isl', 'asl', 'bsl', 'auslan'
  code            text NOT NULL UNIQUE,            -- 'ISL'
  name            text NOT NULL,
  region          text NOT NULL,
  lifecycle       text NOT NULL CHECK (lifecycle IN ('IN_DEVELOPMENT', 'PLANNED', 'AVAILABLE', 'RETIRED')),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER sign_languages_updated_at BEFORE UPDATE ON sign_languages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_profiles (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  avatar_key      text,                            -- object-storage key
  preferred_language text NOT NULL DEFAULT 'en-IN',
  preferred_sign_language text REFERENCES sign_languages(id) ON DELETE SET NULL,
  text_size       text NOT NULL DEFAULT 'default' CHECK (text_size IN ('default', 'large', 'x-large')),
  high_contrast   boolean NOT NULL DEFAULT false,
  reduce_motion   boolean NOT NULL DEFAULT false,
  visual_alerts   boolean NOT NULL DEFAULT false,
  voice_name      text,
  speaking_rate   numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (speaking_rate BETWEEN 0.5 AND 2.0),
  theme           text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Languages a user knows, with proficiency (a user may know several sign languages).
CREATE TABLE user_languages (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_id     text NOT NULL,                   -- spoken ('en-IN') or sign ('isl')
  kind            text NOT NULL CHECK (kind IN ('SPOKEN', 'SIGN')),
  proficiency     text NOT NULL DEFAULT 'FLUENT' CHECK (proficiency IN ('LEARNING', 'CONVERSATIONAL', 'FLUENT', 'NATIVE')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language_id)
);

CREATE TABLE devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('WEB', 'ANDROID', 'IOS', 'DESKTOP')),
  label           text,
  capabilities    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- webgpu, ram_mb, npu, ...
  refresh_token_hash text,                         -- current refresh token (rotated)
  refresh_family  uuid,                            -- reuse detection revokes the family
  last_active_at  timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON devices(user_id) WHERE revoked_at IS NULL;
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type    text NOT NULL CHECK (consent_type IN ('CAMERA_AI_PROCESSING', 'MICROPHONE_AI_PROCESSING', 'DATASET_CONTRIBUTION', 'TERMS', 'PRIVACY')),
  version         text NOT NULL,
  granted         boolean NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz
);
CREATE INDEX user_consents_lookup_idx ON user_consents(user_id, consent_type, granted_at DESC);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('DIRECT', 'GROUP')),
  title           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  pinned_message_id uuid,                          -- FK added after messages exists
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  last_read_at    timestamptz,
  muted_until     timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'SYSTEM', 'TRANSLATION')),
  -- ORIGINAL content only. Ciphertext once E2EE exists; translations live in message_translations.
  body            text,
  body_nonce      text,
  reply_to_id     uuid REFERENCES messages(id) ON DELETE SET NULL,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_time_idx ON messages(conversation_id, created_at DESC);
ALTER TABLE conversations
  ADD CONSTRAINT conversations_pinned_message_fk FOREIGN KEY (pinned_message_id) REFERENCES messages(id) ON DELETE SET NULL;

CREATE TABLE message_receipts (
  message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at    timestamptz,
  read_at         timestamptz,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE message_reactions (
  message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_key     text NOT NULL UNIQUE,            -- object-storage key, never the bytes
  file_name       text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  sha256          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_message_idx ON attachments(message_id);

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------
CREATE TABLE calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  initiated_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  media           text NOT NULL CHECK (media IN ('AUDIO', 'VIDEO')),
  status          text NOT NULL CHECK (status IN ('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED', 'FAILED')),
  sfu_room        text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  answered_at     timestamptz,
  ended_at        timestamptz
);
CREATE INDEX calls_conversation_idx ON calls(conversation_id, started_at DESC);

CREATE TABLE call_participants (
  call_id         uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       timestamptz,
  left_at         timestamptz,
  ai_translation_enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (call_id, user_id)
);

-- ---------------------------------------------------------------------------
-- AI: models, translation, sign video library
-- ---------------------------------------------------------------------------
CREATE TABLE model_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key       text NOT NULL,                   -- e.g. 'isl-recognition', 'asr-en'
  task            text NOT NULL CHECK (task IN ('ASR', 'LANDMARKS', 'SIGN_RECOGNITION', 'SIGN_TRANSLATION', 'TTS')),
  version         text NOT NULL,
  runtime         text NOT NULL CHECK (runtime IN ('ONNX_WEB', 'ONNX_MOBILE', 'LITERT', 'MEDIAPIPE', 'WHISPER_CPP', 'SHERPA_ONNX')),
  artifact_key    text NOT NULL,                   -- object-storage key; binaries never in Git or DB
  size_bytes      bigint NOT NULL,
  sha256          text NOT NULL,
  signature       text NOT NULL,                   -- detached signature, verified on device
  min_ram_mb      integer,
  requires_webgpu boolean NOT NULL DEFAULT false,
  status          text NOT NULL CHECK (status IN ('RESEARCH', 'PROTOTYPE', 'RELEASED', 'WITHDRAWN')),
  evaluation      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- WER, accuracy, GER, signer-independent split, latency
  license         text NOT NULL,
  provenance      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_key, version, runtime)
);

CREATE TABLE model_language_support (
  model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  language_id     text NOT NULL,                   -- sign or spoken language id
  PRIMARY KEY (model_version_id, language_id)
);

CREATE TABLE device_model_installs (
  device_id       uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
  status          text NOT NULL CHECK (status IN ('DOWNLOADING', 'VERIFYING', 'INSTALLED', 'FAILED', 'ROLLED_BACK', 'REMOVED')),
  previous_model_version_id uuid REFERENCES model_versions(id) ON DELETE SET NULL,  -- rollback target
  installed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, model_version_id)
);
CREATE TRIGGER device_model_installs_updated_at BEFORE UPDATE ON device_model_installs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE translation_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  call_id         uuid REFERENCES calls(id) ON DELETE SET NULL,
  direction       text NOT NULL CHECK (direction IN ('SPEECH_TO_SIGN', 'SIGN_TO_SPEECH', 'TEXT_TO_SIGN', 'SIGN_TO_TEXT', 'SPEECH_TO_TEXT')),
  source_language text NOT NULL,
  target_language text NOT NULL,
  model_version_id uuid REFERENCES model_versions(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX translation_sessions_user_idx ON translation_sessions(user_id, started_at DESC);

-- Translated output kept separate from the original message (spec section 9).
CREATE TABLE message_translations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES translation_sessions(id) ON DELETE SET NULL,
  target_language text NOT NULL,
  gloss_sequence  text[],
  translated_text text,
  confidence      numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_translations_message_idx ON message_translations(message_id);

CREATE TABLE sign_video_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sign_language_id text NOT NULL REFERENCES sign_languages(id) ON DELETE RESTRICT,
  storage_key     text NOT NULL UNIQUE,            -- object-storage key
  unit            text NOT NULL CHECK (unit IN ('SENTENCE', 'PHRASE', 'SIGN')),
  duration_ms     integer NOT NULL CHECK (duration_ms > 0),
  width           integer,
  height          integer,
  sha256          text NOT NULL,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  verified_by     uuid REFERENCES users(id) ON DELETE SET NULL,  -- qualified language expert
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_video_assets_lookup_idx ON sign_video_assets(sign_language_id, unit) WHERE verification_status = 'VERIFIED';

CREATE TABLE sign_video_metadata (
  asset_id        uuid PRIMARY KEY REFERENCES sign_video_assets(id) ON DELETE CASCADE,
  gloss           text NOT NULL,
  meaning         text NOT NULL,
  phrase_text     text,                            -- natural-language sentence/phrase
  signer_id       text NOT NULL,                   -- pseudonymous signer identifier
  region          text,
  quality         text CHECK (quality IN ('LOW', 'MEDIUM', 'HIGH')),
  license         text NOT NULL,
  dataset_provenance text NOT NULL,
  consent_id      uuid REFERENCES user_consents(id) ON DELETE RESTRICT
);
CREATE INDEX sign_video_metadata_gloss_idx ON sign_video_metadata(gloss);

CREATE TABLE translation_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES translation_sessions(id) ON DELETE SET NULL,
  message_translation_id uuid REFERENCES message_translations(id) ON DELETE SET NULL,
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  corrected_text  text,
  corrected_gloss text[],
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('MESSAGE', 'INCOMING_CALL', 'MISSED_CALL', 'CONTACT_REQUEST', 'GROUP_INVITE', 'MODEL_UPDATE')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  target_type     text,
  target_id       text,
  ip              inet,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type, target_id);

-- Seed the language registry (metadata only; mirrors apps/backend/src/languages/language-packs.ts).
INSERT INTO sign_languages (id, code, name, region, lifecycle) VALUES
  ('isl', 'ISL', 'Indian Sign Language', 'India', 'IN_DEVELOPMENT'),
  ('asl', 'ASL', 'American Sign Language', 'United States, Canada', 'PLANNED'),
  ('bsl', 'BSL', 'British Sign Language', 'United Kingdom', 'PLANNED'),
  ('auslan', 'Auslan', 'Australian Sign Language', 'Australia', 'PLANNED');

COMMIT;
