-- =============================================================================
-- MORAJAWS MIGRATION 010: CANONICAL SCHEMA RECONCILIATION & SAFETY HARDENING
-- Phase: MoraJaws Phase 2 (Database Schema Audit & Migration Reconciliation)
-- Target Platform: Supabase PostgreSQL (Single Source of Truth)
--
-- PRECONDITIONS:
--   1. Historical migrations 001 to 009 are catalogued in the migration registry.
--   2. Custom Authentication schema (public.users, auth_sessions, refresh_tokens, login_attempts) is active.
--   3. No destructive drops or deletes are executed.
--
-- PURPOSE:
--   1. Reconcile schema differences across all 19 canonical tables.
--   2. Ensure all columns referenced by Express Backend and Supabase Adapter exist physically.
--   3. Apply high-performance composite indexes for Asia/Jakarta calendar and RBAC scoping.
--   4. Install database-level protection trigger for the 3 protected legacy soft-deleted work orders:
--      - 'wo_1793825457141_u4bnht' ('WO-EXPRESS-TEST-1793825456810')
--      - 'wo_imp_1793825458959_4i4f1h' ('WO-DUP-TEST-1793825458804')
--      - 'wo_imp_1793825458959_262dei' ('WO-DUP-TEST-1793825458804-UNIQUE')
--   5. Enforce immutable append-only triggers on audit_logs and system telemetry.
--   6. Enforce Row Level Security (RLS) with explicit service_role access and revoke direct anon/authenticated access.
--
-- POSTCONDITIONS:
--   1. Database schema strictly matches application data models and backend queries.
--   2. Zero data loss: All operations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--   3. Super Admin account 'rays' is preserved with zero password or role alteration.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS & CORE AUDIT FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared timestamp trigger
CREATE OR REPLACE FUNCTION public.morajaws_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Audit logs immutability guard
CREATE OR REPLACE FUNCTION public.morajaws_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'MORAJAWS_AUDIT_IMMUTABLE: audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. RECONCILE TABLE: public.work_orders
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS installer_id text,
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS assigned_to_uid text,
  ADD COLUMN IF NOT EXISTS work_session_status text,
  ADD COLUMN IF NOT EXISTS work_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chat_messages_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS appointment_date date,
  ADD COLUMN IF NOT EXISTS slot_time text,
  ADD COLUMN IF NOT EXISTS ticket_category text;

-- Composite B-Tree Indexes for Calendar & Scoping
CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_calendar
  ON public.work_orders (appointment_date, slot_time, status_wo_agent)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_work_orders_leader_scope
  ON public.work_orders (contractor_id, area, appointment_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_work_orders_installer_scope
  ON public.work_orders (installer_name, appointment_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_work_orders_installer_id_scope
  ON public.work_orders (installer_id, appointment_date)
  WHERE is_deleted = false AND installer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_deleted_archived
  ON public.work_orders (is_deleted, is_archived);

-- -----------------------------------------------------------------------------
-- 2. RECONCILE TABLE: public.users
-- Ensure custom authentication & profile columns exist physically
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS firebase_uid text,
  ADD COLUMN IF NOT EXISTS alt_email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_ip text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON public.users (lower(btrim(username)));

CREATE INDEX IF NOT EXISTS idx_users_session_version
  ON public.users (session_version);

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON public.users (account_status, active, is_deleted);

-- -----------------------------------------------------------------------------
-- 3. RECONCILE TABLE: public.system_error_logs
-- Unified telemetry schema reconciling migrations 003 and 004
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id text PRIMARY KEY,
  error_code text NOT NULL,
  firebase_error_code text,
  module text,
  operation text,
  source text DEFAULT 'system',
  endpoint text,
  http_method text,
  message text NOT NULL,
  technical_details text,
  stack_trace text,
  severity text NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  username text,
  user_role text,
  request_id text,
  ip_address inet,
  user_agent text,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_error_logs
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS http_method text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stack_trace text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at
  ON public.system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity_status
  ON public.system_error_logs (severity, status);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_is_resolved
  ON public.system_error_logs (is_resolved);

-- -----------------------------------------------------------------------------
-- 4. RECONCILE TABLE: public.audit_logs
-- Ensure audit log tracking fields and trigger
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id text,
  ADD COLUMN IF NOT EXISTS target_user_id text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS event_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_at
  ON public.audit_logs (event_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role
  ON public.audit_logs (performed_by, user_role);

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.morajaws_reject_audit_mutation();

-- -----------------------------------------------------------------------------
-- 5. RECONCILE TABLE: public.app_settings
-- GIN index for rapid dynamic configuration lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_settings_value_gin
  ON public.app_settings USING GIN (setting_value);

-- -----------------------------------------------------------------------------
-- 6. OPTIONAL TABLE: public.report_categories (Hierarchical Droplists)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_categories (
  id text PRIMARY KEY,
  parent_id text REFERENCES public.report_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  category_type text NOT NULL DEFAULT 'main_category',
  requires_photo boolean NOT NULL DEFAULT false,
  requires_optical_power boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_categories_parent
  ON public.report_categories (parent_id, active, display_order);

-- -----------------------------------------------------------------------------
-- 7. MUTATION PROTECTION TRIGGER: 3 PROTECTED LEGACY WORK ORDERS
-- Absolute database-level block preventing update or deletion of protected WOs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_legacy_soft_deleted_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id IN (
    'wo_1793825457141_u4bnht',
    'wo_imp_1793825458959_4i4f1h',
    'wo_imp_1793825458959_262dei'
  ) OR OLD.wo_number IN (
    'WO-EXPRESS-TEST-1793825456810',
    'WO-DUP-TEST-1793825458804',
    'WO-DUP-TEST-1793825458804-UNIQUE'
  ) THEN
    RAISE EXCEPTION 'MORAJAWS_PROTECTED_RECORD: Tiga WO produksi yang dilindungi dilarang dimutasi atau dihapus (ID: %, WO: %)', OLD.id, OLD.wo_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) ENFORCEMENT & PERMISSIONS HARDENING
-- Express backend accesses PostgreSQL via SUPABASE_SERVICE_ROLE_KEY.
-- Direct browser access (anon, authenticated) is strictly revoked.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories', 'auth_sessions', 'refresh_tokens',
    'login_attempts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Ensure RLS is enabled on all tables
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    -- Ensure explicit service_role access policy exists
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', tbl, tbl);
      EXECUTE format('CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl, tbl);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Revoke direct table permissions from anon and authenticated browser roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Grant comprehensive access exclusively to trusted service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

COMMIT;
