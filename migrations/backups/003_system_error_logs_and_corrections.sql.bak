-- =============================================================================
-- MORAJAWS DATABASE MIGRATION 003: SYSTEM ERROR LOGS & SCHEMA HARDENING
-- PostgreSQL / Supabase
--
-- Purpose:
--   1. Fills the identified schema omission for `system_error_logs`.
--   2. Adds immutable constraints, structured severity checks, and indexing.
--   3. Enables Row Level Security (RLS) with deny-by-default for anonymous clients.
--   4. Registers Realtime publication for real-time monitoring tables.
--
-- IMPORTANT SAFETY RULES:
--   - Does NOT drop or alter existing tables or columns.
--   - Does NOT touch or delete existing production data.
--   - Non-destructive and idempotent (IF NOT EXISTS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Create table public.system_error_logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id text PRIMARY KEY,
  error_code text NOT NULL,
  firebase_error_code text,
  module text NOT NULL,
  operation text NOT NULL,
  message text NOT NULL,
  technical_details text,
  severity text NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexing for error monitoring queries
CREATE INDEX IF NOT EXISTS idx_system_error_logs_code
ON public.system_error_logs (error_code);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_module
ON public.system_error_logs (module);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity_status
ON public.system_error_logs (severity, status);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at
ON public.system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_user
ON public.system_error_logs (user_id);

-- Attach standard updated_at trigger
DROP TRIGGER IF EXISTS trg_system_error_logs_updated_at ON public.system_error_logs;
CREATE TRIGGER trg_system_error_logs_updated_at
BEFORE UPDATE ON public.system_error_logs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Row Level Security for system_error_logs
-- -----------------------------------------------------------------------------

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- Note: No anonymous SELECT/INSERT/UPDATE policy is granted to anon.
-- Only trusted backend with service-role key or verified Super Admin can access.

-- -----------------------------------------------------------------------------
-- 3. Supabase Realtime Publication Configuration (Sandbox & Future Ops)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Add tables to realtime publication if the publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.system_error_logs;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

COMMIT;
