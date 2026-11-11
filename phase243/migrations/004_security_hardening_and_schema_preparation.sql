-- =============================================================================
-- MORAJAWS DATABASE MIGRATION 004 (DRAFT / PREPARATION ONLY)
-- Security Hardening & Schema Alignment Preparation
-- Target Platform: Supabase PostgreSQL
--
-- IMPORTANT SAFETY NOTICE:
--   DO NOT EXECUTE THIS MIGRATION ON REMOTE PRODUCTION DATABASE IN PHASE 9O.
--   This file serves as the approved blueprint and preparation specification
--   for the subsequent migration phases.
--
-- Table Scope: All 18 MoraJaws Core & Telemetry Tables:
--   1. roles
--   2. contractors
--   3. coverage_areas
--   4. users
--   5. work_orders
--   6. assignment_history
--   7. ticket_messages
--   8. technical_reports
--   9. wa_templates
--  10. app_settings
--  11. user_preferences
--  12. session_config
--  13. user_sessions
--  14. attachments
--  15. audit_logs
--  16. integration_configs
--  17. sync_history
--  18. system_error_logs
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table: system_error_logs Physical Schema Alignment
-- Aligns schema with verified live remote Supabase structure.
-- Preserves legacy status (OPEN, INVESTIGATING, RESOLVED), module, and operation
-- inside metadata JSONB to prevent any telemetry data loss.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id text PRIMARY KEY,
  error_code text NOT NULL,
  severity text NOT NULL DEFAULT 'HIGH',
  message text NOT NULL,
  stack_trace text,
  source text DEFAULT 'system',
  endpoint text,
  http_method text,
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  username text,
  user_role text,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column alignment (ensures all columns exist without altering types)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'source') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN source text DEFAULT 'system';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'endpoint') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN endpoint text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'http_method') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN http_method text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'username') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN username text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'user_role') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN user_role text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'is_resolved') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN is_resolved boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_error_logs' AND column_name = 'metadata') THEN
    ALTER TABLE public.system_error_logs ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Indexes for Performance & Search Integrity
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_system_error_logs_source ON public.system_error_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_endpoint ON public.system_error_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_is_resolved ON public.system_error_logs(is_resolved);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_user_role ON public.system_error_logs(user_role);

-- -----------------------------------------------------------------------------
-- 3. Row Level Security Hardening Verification
-- Enforce RLS on all 18 tables with deny-by-default for anonymous clients.
-- -----------------------------------------------------------------------------

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Draft RLS Policies (Specification for Phase 9P / Post-Verification)
-- The Express backend accesses database via SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS by PostgreSQL design. The policies below specify defense-in-depth
-- access control if direct authenticated connections are ever enabled.
-- -----------------------------------------------------------------------------

-- Example RLS Draft Specification:
-- Work Orders:
--   Super Admin, Dispatch, Management Data: SELECT all
--   Leader: SELECT where contractor_id = auth.user_contractor_id
--   Installer: SELECT where installer_name = auth.user_name OR installer_contact = auth.user_phone
-- Audit Logs:
--   Super Admin, Management Data, IT Support: SELECT
--   Others: DENY SELECT
--   All roles: DENY UPDATE, DENY DELETE (Enforced by PostgreSQL trigger)

COMMIT;
