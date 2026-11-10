-- =============================================================================
-- MORAJAWS MIGRATION 006: CUSTOM AUTHENTICATION SCHEMA FOR SUPABASE POSTGRESQL
-- Description: Implementasi skema Custom Authentication internal MoraJaws
--              menggunakan Supabase PostgreSQL sebagai DATABASE UTAMA.
--              Menghapus ketergantungan pada Supabase Auth (auth.users).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pastikan ekstensi pgcrypto tersedia untuk fungsi hash
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 2. Sesuaikan Tabel public.users
-- -----------------------------------------------------------------------------
-- Tambahkan kolom yang diperlukan untuk Custom Auth jika belum ada
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_ip text;

-- Pastikan constraints dan index untuk username & email
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
ON public.users (lower(btrim(username)));

CREATE INDEX IF NOT EXISTS idx_users_account_status
ON public.users (account_status, active, is_deleted);

CREATE INDEX IF NOT EXISTS idx_users_session_version
ON public.users (session_version);

-- -----------------------------------------------------------------------------
-- 3. Tabel public.auth_sessions
-- Menyimpan sesi login aktif pengguna MoraJaws
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id_hash text NOT NULL,
  token_hash text,
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  device_type text DEFAULT 'desktop',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
ON public.auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_id_hash
ON public.auth_sessions (session_id_hash);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
ON public.auth_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_revoked
ON public.auth_sessions (expires_at, revoked_at);

-- -----------------------------------------------------------------------------
-- 4. Tabel public.refresh_tokens
-- Menyimpan refresh token dengan rotasi token yang aman
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id text REFERENCES public.auth_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
ON public.refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id
ON public.refresh_tokens (session_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
ON public.refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_revoked
ON public.refresh_tokens (expires_at, revoked_at);

-- -----------------------------------------------------------------------------
-- 5. Tabel public.login_attempts
-- Mencatat seluruh percobaan login untuk proteksi Brute Force & Rate Limiting
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  ip_address text,
  success boolean NOT NULL DEFAULT false,
  reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier
ON public.login_attempts (lower(btrim(identifier)), attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
ON public.login_attempts (ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at
ON public.login_attempts (attempted_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Penyesuaian Kolom pada public.audit_logs
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id text,
  ADD COLUMN IF NOT EXISTS target_user_id text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
ON public.audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id
ON public.audit_logs (target_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON public.audit_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security (RLS) pada tabel-tabel Autentikasi
-- Seluruh akses data autentikasi WAJIB melalui backend dengan SERVICE ROLE KEY
-- -----------------------------------------------------------------------------
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_sessions_service_role_all ON public.auth_sessions;
CREATE POLICY auth_sessions_service_role_all ON public.auth_sessions
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS refresh_tokens_service_role_all ON public.refresh_tokens;
CREATE POLICY refresh_tokens_service_role_all ON public.refresh_tokens
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS login_attempts_service_role_all ON public.login_attempts;
CREATE POLICY login_attempts_service_role_all ON public.login_attempts
FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
