-- =============================================================================
-- MORAJAWS MIGRATION 008: PHASE 1 CUSTOM AUTH SESSION VERSION ALIGNMENT
-- Description: Non-destructive alignment of session_version columns on
--              auth_sessions and refresh_tokens tables to enable direct
--              database-level session invalidation queries.
-- Date: 2026-11-10
-- Phase: MoraJaws Phase 1 (Custom Login Stabilization)
-- =============================================================================

BEGIN;

-- 1. Ensure session_version exists on public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

-- 2. Non-destructively add session_version to public.auth_sessions
ALTER TABLE public.auth_sessions
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_version
  ON public.auth_sessions (session_version);

-- 3. Non-destructively add session_version to public.refresh_tokens
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_version
  ON public.refresh_tokens (session_version);

-- 4. Document migration completion
COMMENT ON COLUMN public.auth_sessions.session_version IS 'MoraJaws session version stamp matching user session_version at creation time';
COMMENT ON COLUMN public.refresh_tokens.session_version IS 'MoraJaws session version stamp matching user session_version at rotation time';

COMMIT;
