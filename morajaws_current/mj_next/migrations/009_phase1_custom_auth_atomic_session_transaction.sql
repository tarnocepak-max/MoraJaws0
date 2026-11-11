-- =============================================================================
-- MORAJAWS MIGRATION 009: PHASE 1 CUSTOM AUTH ATOMIC TRANSACTION & INTEGRITY
-- Description: Non-destructive functions and schema alignment to guarantee
--              atomic session creation, atomic refresh token rotation, and
--              immediate session version revocation at PostgreSQL level.
-- Date: 2026-11-10
-- Phase: MoraJaws Phase 1 (Custom Auth Fail-Closed & Session Integrity)
-- Status: PROPOSAL / STANDALONE MIGRATION — NON-DESTRUCTIVE
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure Extensions & Column Alignment (Idempotent)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1.A. public.users session_version column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_users_session_version
  ON public.users (session_version);

-- 1.B. public.auth_sessions session_version column
ALTER TABLE public.auth_sessions
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_version
  ON public.auth_sessions (session_version);

-- 1.C. public.refresh_tokens session_version column
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_version
  ON public.refresh_tokens (session_version);

-- -----------------------------------------------------------------------------
-- 2. Atomic Function: Create Auth Session & Initial Refresh Token
-- Guarantees atomic insertion of both records; if either fails, entire transaction rolls back.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_auth_session_atomic(
  p_session_id text,
  p_user_id text,
  p_session_id_hash text,
  p_token_hash text,
  p_rt_id text,
  p_rt_hash text,
  p_session_expires_at timestamptz,
  p_rt_expires_at timestamptz,
  p_session_version integer,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_ver integer;
BEGIN
  -- Verify user existence and active status
  SELECT session_version INTO v_user_ver
  FROM public.users
  WHERE id = p_user_id AND is_deleted = false AND active = true;

  IF v_user_ver IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_ELIGIBLE: Pengguna tidak ditemukan atau berstatus tidak aktif.';
  END IF;

  -- Insert auth_session record
  INSERT INTO public.auth_sessions (
    id,
    user_id,
    session_id_hash,
    token_hash,
    expires_at,
    last_activity_at,
    session_version,
    revoked_at,
    ip_address,
    user_agent,
    device_type,
    created_at
  ) VALUES (
    p_session_id,
    p_user_id,
    p_session_id_hash,
    p_token_hash,
    p_session_expires_at,
    now(),
    p_session_version,
    NULL,
    p_ip_address,
    p_user_agent,
    p_device_type,
    now()
  );

  -- Insert refresh_token record
  INSERT INTO public.refresh_tokens (
    id,
    user_id,
    session_id,
    token_hash,
    session_version,
    expires_at,
    revoked_at,
    replaced_by_token_hash,
    created_at
  ) VALUES (
    p_rt_id,
    p_user_id,
    p_session_id,
    p_rt_hash,
    p_session_version,
    p_rt_expires_at,
    NULL,
    NULL,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'expires_at', p_session_expires_at,
    'session_version', p_session_version
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Atomic Function: Rotate Refresh Token
-- Guarantees atomic revocation of old refresh token, insertion of new refresh token,
-- and updating the parent auth_session expiration and token hash.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rotate_refresh_token_atomic(
  p_old_rt_hash text,
  p_new_rt_id text,
  p_new_rt_hash text,
  p_new_session_hash text,
  p_new_session_expires_at timestamptz,
  p_new_rt_expires_at timestamptz,
  p_session_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_rt record;
  v_user record;
  v_now timestamptz := now();
BEGIN
  -- 1. Find existing refresh token
  SELECT * INTO v_old_rt
  FROM public.refresh_tokens
  WHERE token_hash = p_old_rt_hash
  FOR UPDATE;

  IF v_old_rt.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REFRESH_TOKEN', 'message', 'Refresh token tidak valid atau tidak ditemukan.');
  END IF;

  -- 2. Detect Replay Attack: token already revoked
  IF v_old_rt.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'REFRESH_TOKEN_REVOKED', 'message', 'Refresh token telah dicabut (terindikasi replay attack).');
  END IF;

  -- 3. Check Expiry
  IF v_old_rt.expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'code', 'REFRESH_TOKEN_EXPIRED', 'message', 'Refresh token telah kedaluwarsa.');
  END IF;

  -- 4. Check User state & session version
  SELECT id, session_version, active, is_deleted INTO v_user
  FROM public.users
  WHERE id = v_old_rt.user_id;

  IF v_user.id IS NULL OR v_user.is_deleted OR NOT v_user.active THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCOUNT_DISABLED', 'message', 'Akun telah dinonaktifkan.');
  END IF;

  IF COALESCE(v_user.session_version, 1) <> p_session_version THEN
    -- Mismatch: revoke old token immediately
    UPDATE public.refresh_tokens SET revoked_at = v_now WHERE id = v_old_rt.id;
    RETURN jsonb_build_object('success', false, 'code', 'REFRESH_TOKEN_REVOKED', 'message', 'Session version mismatch. Silakan login kembali.');
  END IF;

  -- 5. Revoke old refresh token & mark replacement
  UPDATE public.refresh_tokens
  SET revoked_at = v_now,
      replaced_by_token_hash = p_new_rt_hash
  WHERE id = v_old_rt.id;

  -- 6. Insert new refresh token
  INSERT INTO public.refresh_tokens (
    id,
    user_id,
    session_id,
    token_hash,
    session_version,
    expires_at,
    revoked_at,
    replaced_by_token_hash,
    created_at
  ) VALUES (
    p_new_rt_id,
    v_user.id,
    v_old_rt.session_id,
    p_new_rt_hash,
    p_session_version,
    p_new_rt_expires_at,
    NULL,
    NULL,
    v_now
  );

  -- 7. Update parent session
  UPDATE public.auth_sessions
  SET session_id_hash = p_new_session_hash,
      token_hash = p_new_session_hash,
      expires_at = p_new_session_expires_at,
      last_activity_at = v_now
  WHERE id = v_old_rt.session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_old_rt.session_id,
    'expires_at', p_new_session_expires_at,
    'user_id', v_user.id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Atomic Function: Revoke All User Sessions
-- Increments user session_version, revokes all active auth_sessions, and revokes
-- all active refresh_tokens in a single atomic transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_revoke_all_user_sessions_atomic(
  p_user_id text,
  p_revoked_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version integer;
  v_now timestamptz := now();
  v_sessions_count integer;
  v_rt_count integer;
BEGIN
  -- 1. Increment session_version atomically
  UPDATE public.users
  SET session_version = COALESCE(session_version, 1) + 1,
      updated_at = v_now
  WHERE id = p_user_id
  RETURNING session_version INTO v_next_version;

  IF v_next_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND', 'message', 'Pengguna tidak ditemukan.');
  END IF;

  -- 2. Revoke active auth_sessions
  WITH updated_sessions AS (
    UPDATE public.auth_sessions
    SET revoked_at = v_now
    WHERE user_id = p_user_id AND revoked_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_sessions_count FROM updated_sessions;

  -- 3. Revoke active refresh_tokens
  WITH updated_tokens AS (
    UPDATE public.refresh_tokens
    SET revoked_at = v_now
    WHERE user_id = p_user_id AND revoked_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_rt_count FROM updated_tokens;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'new_session_version', v_next_version,
    'revoked_sessions_count', v_sessions_count,
    'revoked_tokens_count', v_rt_count,
    'revoked_at', v_now
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants to service_role
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_create_auth_session_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rotate_refresh_token_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_revoke_all_user_sessions_atomic TO service_role;

COMMIT;
