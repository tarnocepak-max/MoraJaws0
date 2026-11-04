-- =============================================================================
-- MORAJAWS CORE DATABASE SCHEMA - MIGRATION 001 (REVISED)
-- PostgreSQL / Supabase
--
-- Purpose:
--   Prepare a durable relational store for the existing MoraJaws backend.
--   Firebase Authentication remains the identity provider.
--   Firebase Storage remains the attachment/object store.
--
-- IMPORTANT:
--   1. This migration does NOT import or delete existing production data.
--   2. No demo users, demo contractors, demo work orders, or fake credentials
--      are inserted.
--   3. All application access must go through the trusted MoraJaws backend.
--   4. Use the Supabase service-role key ONLY on the backend; never in a browser.
--   5. JSONB "payload" columns preserve legacy/dynamic fields during migration.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Shared timestamp trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.morajaws_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Audit rows are append-only. Corrections should be new audit events.
CREATE OR REPLACE FUNCTION public.morajaws_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Roles
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roles (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_permissions_array CHECK (jsonb_typeof(permissions) = 'array')
);

-- Known MoraJaws role codes only. No user accounts are seeded.
INSERT INTO public.roles (id, code, name, description)
VALUES
  ('role-super-admin', 'super_admin', 'Super Admin', 'MoraJaws super administrator'),
  ('role-dispatch', 'dispatch', 'Dispatch', 'MoraJaws dispatch operations'),
  ('role-leader', 'leader', 'Leader', 'MoraJaws team leader'),
  ('role-installer', 'installer', 'Installer', 'MoraJaws field installer'),
  ('role-management-data', 'management_data', 'Management Data', 'MoraJaws data management'),
  ('role-it-support', 'it_support', 'IT Support', 'MoraJaws IT support')
ON CONFLICT (code) DO NOTHING;

DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;
CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Contractors and coverage areas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractors (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text,
  coverage_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  leader_id text,
  leader_name text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractors_coverage_areas_array
    CHECK (jsonb_typeof(coverage_areas) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contractors_code_normalized
ON public.contractors (lower(btrim(code)))
WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS idx_contractors_active
ON public.contractors (active, is_archived);

DROP TRIGGER IF EXISTS trg_contractors_updated_at ON public.contractors;
CREATE TRIGGER trg_contractors_updated_at
BEFORE UPDATE ON public.contractors
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

CREATE TABLE IF NOT EXISTS public.coverage_areas (
  id text PRIMARY KEY,
  name text NOT NULL,
  clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coverage_areas_clusters_array
    CHECK (jsonb_typeof(clusters) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coverage_areas_name_normalized
ON public.coverage_areas (lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_coverage_areas_updated_at ON public.coverage_areas;
CREATE TRIGGER trg_coverage_areas_updated_at
BEFORE UPDATE ON public.coverage_areas
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Users
-- Firebase Authentication remains the authority for password verification.
-- Do not store Firebase passwords, ID tokens, refresh tokens, or raw sessions.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  firebase_uid text UNIQUE,
  name text NOT NULL,
  username text NOT NULL,
  email text,
  alt_email text,
  phone text,
  role text NOT NULL REFERENCES public.roles(code) ON UPDATE CASCADE,
  role_id text REFERENCES public.roles(id) ON UPDATE CASCADE,
  contractor_id text REFERENCES public.contractors(id) ON DELETE SET NULL,
  contractor text,
  area text,
  cluster_name text,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_login_at timestamptz,
  login_count integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by text,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_permissions_array CHECK (jsonb_typeof(permissions) = 'array'),
  CONSTRAINT users_login_count_nonnegative CHECK (login_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_normalized
ON public.users (lower(btrim(username)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized
ON public.users (lower(btrim(email)))
WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_users_role_active
ON public.users (role, active, is_deleted);

CREATE INDEX IF NOT EXISTS idx_users_contractor
ON public.users (contractor_id);

CREATE INDEX IF NOT EXISTS idx_users_area
ON public.users (area);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Work orders / tickets
-- Preserve legacy camelCase and unmapped properties in payload.
-- Dates are DATE (not TIMESTAMPTZ) to avoid Jakarta/UTC day shifting.
-- Fields that can be absent in source imports remain nullable.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_orders (
  id text PRIMARY KEY,
  wo_number text NOT NULL,
  work_order_number text,
  id_customer text,
  customer_id text,
  ticket_number text,
  ticket_date date,
  date date,
  appointment_date date,
  date_upload text,
  file_name text,
  agent_id text,

  customer_name text,
  end_user_name text,
  customer_phone text,
  customer_contact1 text,
  customer_contact2 text,
  customer_contact3 text,
  customer_phone_normalized text,
  street_name text,
  street_alternatif text,
  address text,
  city text,
  postal_code text,
  cluster_name text,
  area text,

  appointment_type text,
  slot_time text,
  ticket_category text,
  initial_ticket_category text,

  installation_type text,
  service_type text,
  homepass_type text,
  homepass_detail_id text,
  olt_code text,
  fdt_code text,
  fat_code text,
  fat_port text,
  dropcore_length text,
  plan text,
  service_aging_maintenance text,
  vendor_name text,
  router text,
  ont_brand text,
  ont_model text,
  router_brand text,
  router_model text,
  router_serial_number text,
  stb1_sn text,
  stb1_mac text,
  stb2_sn text,
  stb2_mac text,
  stb3_sn text,
  stb3_mac text,
  ont_serial_number text,
  ont_mac_address text,
  rg_serial_number text,
  rg_mac_address text,

  contractor_id text REFERENCES public.contractors(id) ON DELETE SET NULL,
  contractor_name text,
  contactor_name text, -- legacy spelling retained for compatibility
  leader_name text,
  corlap_name text,
  corlap_contact text,
  installer_name text,
  installer_contact text,
  installer_contact2 text,
  installer_email text,
  date_assign_agent timestamptz,
  date_assign_technician timestamptz,
  assigned_at timestamptz,
  assigned_by text,
  reassigned_at timestamptz,
  reassigned_by text,
  reassignment_reason text,

  distribution_status text NOT NULL DEFAULT 'pending',
  distribution_notes text,

  status_wo_agent text NOT NULL DEFAULT 'Pending',
  status_wo_installer text NOT NULL DEFAULT 'Unassigned',
  status_whatsapp text NOT NULL DEFAULT 'not_prepared',
  remarks_wo_installer text,
  remarks_agent text,
  remarks text,

  wa_message_preview text,
  wa_generated_url text,
  wa_last_opened_at timestamptz,
  wa_confirmed_at timestamptz,
  wa_confirmed_by text,
  wa_confirmation_notes text,

  chat_messages_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_snippet text,

  check_in_at timestamptz,
  work_session_status text,
  work_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,

  closed_at timestamptz,
  closed_by text,
  close_notes text,
  reopen_reason text,

  technical_report jsonb,

  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by text,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,

  unmapped_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz,
  import_date date,
  import_batch_id text,

  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,

  CONSTRAINT work_orders_unmapped_headers_array
    CHECK (jsonb_typeof(unmapped_headers) = 'array'),
  CONSTRAINT work_orders_additional_fields_object
    CHECK (jsonb_typeof(additional_fields) = 'object'),
  CONSTRAINT work_orders_work_sessions_array
    CHECK (jsonb_typeof(work_sessions) = 'array'),
  CONSTRAINT work_orders_chat_count_nonnegative
    CHECK (chat_messages_count >= 0)
);

-- Normalized WO uniqueness: ignores case and whitespace, but does not rewrite
-- the original WO value. Existing duplicates must be audited before data import.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_wo_number_normalized
ON public.work_orders (lower(regexp_replace(btrim(wo_number), '\s+', '', 'g')))
WHERE wo_number IS NOT NULL AND btrim(wo_number) <> '';

CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_date
ON public.work_orders (appointment_date);

CREATE INDEX IF NOT EXISTS idx_work_orders_date
ON public.work_orders (date);

CREATE INDEX IF NOT EXISTS idx_work_orders_status_agent
ON public.work_orders (status_wo_agent);

CREATE INDEX IF NOT EXISTS idx_work_orders_status_installer
ON public.work_orders (status_wo_installer);

CREATE INDEX IF NOT EXISTS idx_work_orders_status_whatsapp
ON public.work_orders (status_whatsapp);

CREATE INDEX IF NOT EXISTS idx_work_orders_contractor
ON public.work_orders (contractor_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_area_cluster
ON public.work_orders (area, cluster_name);

CREATE INDEX IF NOT EXISTS idx_work_orders_installer
ON public.work_orders (installer_name);

CREATE INDEX IF NOT EXISTS idx_work_orders_distribution
ON public.work_orders (distribution_status);

CREATE INDEX IF NOT EXISTS idx_work_orders_deleted_archived
ON public.work_orders (is_deleted, is_archived);

CREATE INDEX IF NOT EXISTS idx_work_orders_import_batch
ON public.work_orders (import_batch_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_customer
ON public.work_orders (customer_id, id_customer);

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trg_work_orders_updated_at
BEFORE UPDATE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Assignment and reassignment history
-- No cascading deletion from work_orders: history must survive soft deletion.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assignment_history (
  id text PRIMARY KEY,
  work_order_id text REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  wo_number text NOT NULL,
  contractor_id text REFERENCES public.contractors(id) ON DELETE SET NULL,
  contractor_name text,
  leader_id text,
  leader_name text,
  previous_installer_name text,
  previous_installer text,
  installer_name text,
  assigned_installer text,
  installer_contact text,
  slot_time text,
  appointment_date date,
  source_action text NOT NULL DEFAULT 'initial_assignment',
  previous_status text,
  new_status text,
  reason text,
  notes text,
  performed_by_id text,
  performed_by text NOT NULL,
  performed_by_role text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_work_order
ON public.assignment_history (work_order_id);

CREATE INDEX IF NOT EXISTS idx_assignment_history_wo
ON public.assignment_history (wo_number);

CREATE INDEX IF NOT EXISTS idx_assignment_history_installer
ON public.assignment_history (installer_name);

CREATE INDEX IF NOT EXISTS idx_assignment_history_created
ON public.assignment_history (created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. Ticket live-chat messages
-- No cascade deletion; retain conversation history for audit/retention policy.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id text PRIMARY KEY,
  ticket_id text REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  wo_number text,
  sender_id text,
  sender_name text NOT NULL,
  sender_role text NOT NULL,
  message_text text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_messages_attachments_array
    CHECK (jsonb_typeof(attachments) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
ON public.ticket_messages (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_wo_created
ON public.ticket_messages (wo_number, created_at);

-- -----------------------------------------------------------------------------
-- 8. Technical reports
-- No cascade deletion from work_orders.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.technical_reports (
  id text PRIMARY KEY,
  work_order_id text REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  ticket_id text,
  wo_number text NOT NULL,
  main_category text,
  root_cause text,
  sub_category text,
  root_cause_category text,
  root_cause_sub_category text,
  work_result text,
  technical_description text,
  corrective_action text,
  used_materials text,
  device_serial_number text,
  optical_power_dbm text,
  optical_power_rx text,
  photo_before_url text,
  photo_after_url text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_time timestamptz,
  end_time timestamptz,
  additional_notes text,
  verified_by_dispatch boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by text,
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technical_reports_photos_array
    CHECK (jsonb_typeof(photos) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_technical_reports_work_order
ON public.technical_reports (work_order_id);

CREATE INDEX IF NOT EXISTS idx_technical_reports_wo
ON public.technical_reports (wo_number);

DROP TRIGGER IF EXISTS trg_technical_reports_updated_at ON public.technical_reports;
CREATE TRIGGER trg_technical_reports_updated_at
BEFORE UPDATE ON public.technical_reports
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 9. WhatsApp templates
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wa_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text,
  body text,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  updated_by text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_active
ON public.wa_templates (active);

DROP TRIGGER IF EXISTS trg_wa_templates_updated_at ON public.wa_templates;
CREATE TRIGGER trg_wa_templates_updated_at
BEFORE UPDATE ON public.wa_templates
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 10. Application settings and per-user preferences
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_config (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 11. User sessions - metadata only; never persist raw bearer tokens.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  username text NOT NULL,
  name text NOT NULL,
  role text NOT NULL REFERENCES public.roles(code) ON UPDATE CASCADE,
  contractor text,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  ip_address inet,
  user_agent text,
  device_type text DEFAULT 'unknown',
  token_fingerprint text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
ON public.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_status_expiry
ON public.user_sessions (status, expires_at);

-- -----------------------------------------------------------------------------
-- 12. Attachments metadata only. Binary files stay in Firebase Storage.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attachments (
  id text PRIMARY KEY,
  file_id text UNIQUE,
  work_order_id text REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  ticket_id text,
  wo_number text,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  storage_provider text NOT NULL DEFAULT 'firebase_storage',
  storage_path text,
  download_url text,
  sender_id text,
  sender_name text,
  sender_role text,
  validation_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_file_size_nonnegative
    CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attachments_work_order
ON public.attachments (work_order_id);

CREATE INDEX IF NOT EXISTS idx_attachments_wo
ON public.attachments (wo_number);

-- -----------------------------------------------------------------------------
-- 13. Audit logs - append-only
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  details text NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  performed_by_id text,
  performed_by text NOT NULL,
  user_role text NOT NULL,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON public.audit_logs (entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON public.audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
ON public.audit_logs (performed_by, user_role);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_at
ON public.audit_logs (event_at DESC);

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_reject_audit_mutation();

-- -----------------------------------------------------------------------------
-- 14. Integration configuration and sync history
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.integration_configs (
  config_key text PRIMARY KEY,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference text,
  enabled boolean NOT NULL DEFAULT false,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_history (
  id text PRIMARY KEY,
  job_id text NOT NULL UNIQUE,
  sync_type text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL,
  processed_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  new_records_count integer NOT NULL DEFAULT 0,
  updated_records_count integer NOT NULL DEFAULT 0,
  error_summary text,
  data_source text,
  initiated_by text,
  initiated_by_role text,
  duration_ms bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sync_history_counts_nonnegative CHECK (
    processed_count >= 0 AND success_count >= 0 AND failed_count >= 0
    AND new_records_count >= 0 AND updated_records_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_sync_history_started
ON public.sync_history (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_history_status
ON public.sync_history (status);

DROP TRIGGER IF EXISTS trg_integration_configs_updated_at ON public.integration_configs;
CREATE TRIGGER trg_integration_configs_updated_at
BEFORE UPDATE ON public.integration_configs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 15. Row Level Security
--
-- Intentionally no client-facing policies are created in this migration.
-- This makes direct anon/authenticated access deny-by-default.
-- Trusted server uses the Supabase service-role key and enforces MoraJaws RBAC
-- after verifying the Firebase ID token with Firebase Admin SDK.
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

-- No GRANT to anon/authenticated is added here.
-- Keep service-role credentials exclusively in backend environment variables.

COMMIT;

-- =============================================================================
-- POST-MIGRATION CHECKS (run separately after successful execution)
--
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
--
-- SELECT code, name FROM public.roles ORDER BY code;
--
-- SELECT
--   schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- Before importing work orders, audit existing source duplicates:
--   normalize WO by trimming, removing whitespace, and case-folding.
-- Do NOT deduplicate or delete production records automatically.
-- =============================================================================
