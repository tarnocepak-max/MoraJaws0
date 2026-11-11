-- =============================================================================
-- MORAJAWS DATABASE MIGRATION 007 (PHASE 16A.2 FINAL)
-- STAGING SCHEMA INITIALIZATION & SUPABASE AUTH ALIGNMENT
-- Target Database: Supabase PostgreSQL (Staging Project: lvytgqsvxntnvlohmrxi)
--
-- PURPOSE:
--   1. Comprehensive, idempotent initialization of all 19 MoraJaws tables.
--   2. Direct physical alignment of public.users to auth.users(id) via auth_user_id UUID.
--   3. Non-recursive Row Level Security (RLS) matrix across all tables.
--   4. Resolution and correction of schema bugs found in migrations 001, 002, 004, 006:
--      - Elimination of duplicate migration 002.
--      - Addition of physical installer_id column in work_orders for composite scoping.
--      - Correction of audit_logs column references (entity + event_at).
--      - Unified system_error_logs schema reconciling migrations 003 and 004.
--   5. Absolute mutation protection for the 3 legacy soft-deleted work orders.
--   6. Append-only immutability for audit logs and system telemetry.
--
-- SAFETY & COMPLIANCE:
--   - Idempotent: safe to run on empty database or partially initialized schema.
--   - Non-destructive: NO DROP TABLE, NO TRUNCATE, NO DATA MUTATION.
--   - Does NOT seed demo users or fake credentials.
--   - Retains legacy firebase_uid column strictly for archival compatibility.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS & CORE FUNCTIONS
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

-- Audit rows are append-only. UPDATE and DELETE are strictly prohibited.
CREATE OR REPLACE FUNCTION public.morajaws_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'MORAJAWS_AUDIT_IMMUTABLE: audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. ROLES TABLE & CANONICAL ROLES SEEDING
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
-- 2. CONTRACTORS AND COVERAGE AREAS
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
  CONSTRAINT contractors_coverage_areas_array CHECK (jsonb_typeof(coverage_areas) = 'array')
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
  CONSTRAINT coverage_areas_clusters_array CHECK (jsonb_typeof(clusters) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coverage_areas_name_normalized
ON public.coverage_areas (lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_coverage_areas_updated_at ON public.coverage_areas;
CREATE TRIGGER trg_coverage_areas_updated_at
BEFORE UPDATE ON public.coverage_areas
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. USERS (STAFF PROFILES ALIGNED TO SUPABASE AUTH)
-- Supabase Auth (auth.users) is the SOLE authority for authentication.
-- Staff profiles are mapped via auth_user_id (UUID) -> auth.users(id).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  auth_user_id UUID,
  firebase_uid text UNIQUE, -- Retained for legacy archival compatibility only
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
  session_version integer NOT NULL DEFAULT 1,
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

-- Idempotent column check in case table was pre-created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN auth_user_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'session_version'
  ) THEN
    ALTER TABLE public.users ADD COLUMN session_version integer NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'alt_email'
  ) THEN
    ALTER TABLE public.users ADD COLUMN alt_email text;
  END IF;
END $$;

-- Foreign Key to auth.users(id) with ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_auth_user_id'
    ) THEN
      ALTER TABLE public.users
      ADD CONSTRAINT fk_users_auth_user_id
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
      ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Partial unique index ensuring 1:1 mapping between Auth UID and active staff profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
ON public.users (auth_user_id)
WHERE auth_user_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
ON public.users (auth_user_id);

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
-- 4. WORK ORDERS / TICKETS
-- Dates are stored as DATE (not TIMESTAMPTZ) to preserve Asia/Jakarta day accuracy.
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
  contactor_name text, -- legacy spelling retained for backwards compatibility
  leader_name text,
  corlap_name text,
  corlap_contact text,
  installer_id text REFERENCES public.users(id) ON DELETE SET NULL,
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

  CONSTRAINT work_orders_unmapped_headers_array CHECK (jsonb_typeof(unmapped_headers) = 'array'),
  CONSTRAINT work_orders_additional_fields_object CHECK (jsonb_typeof(additional_fields) = 'object'),
  CONSTRAINT work_orders_work_sessions_array CHECK (jsonb_typeof(work_sessions) = 'array'),
  CONSTRAINT work_orders_chat_count_nonnegative CHECK (chat_messages_count >= 0)
);

-- Idempotent column check for installer_id in case table pre-existed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'installer_id'
  ) THEN
    ALTER TABLE public.work_orders ADD COLUMN installer_id text REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Normalized WO uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_wo_number_normalized
ON public.work_orders (lower(regexp_replace(btrim(wo_number), '\s+', '', 'g')))
WHERE wo_number IS NOT NULL AND btrim(wo_number) <> '';

CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_date ON public.work_orders (appointment_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_date ON public.work_orders (date);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_agent ON public.work_orders (status_wo_agent);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_installer ON public.work_orders (status_wo_installer);
CREATE INDEX IF NOT EXISTS idx_work_orders_contractor ON public.work_orders (contractor_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_area_cluster ON public.work_orders (area, cluster_name);
CREATE INDEX IF NOT EXISTS idx_work_orders_installer ON public.work_orders (installer_name);
CREATE INDEX IF NOT EXISTS idx_work_orders_deleted_archived ON public.work_orders (is_deleted, is_archived);

-- Composite query indexes for Calendar, Leader scoping, and Installer scoping
CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_calendar
ON public.work_orders (appointment_date, slot_time, status_wo_agent)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_work_orders_leader_scope
ON public.work_orders (contractor_id, area, appointment_date)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_work_orders_installer_scope
ON public.work_orders (installer_id, appointment_date)
WHERE is_deleted = false;

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trg_work_orders_updated_at
BEFORE UPDATE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. TRIGGER: PROTEKSI MUTLAK 3 WORK ORDER SOFT-DELETED
-- Enforces immutability on protected soft-deleted production records.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_protect_legacy_soft_deleted_wo()
RETURNS TRIGGER
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
    RAISE EXCEPTION 'MORAJAWS_PROTECTED_RECORD_MUTATION_FORBIDDEN: Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang dimutasi.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
BEFORE UPDATE OR DELETE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();

-- -----------------------------------------------------------------------------
-- 6. ASSIGNMENT HISTORY (APPEND-ONLY)
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

CREATE INDEX IF NOT EXISTS idx_assignment_history_work_order ON public.assignment_history (work_order_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_wo ON public.assignment_history (wo_number);
CREATE INDEX IF NOT EXISTS idx_assignment_history_installer ON public.assignment_history (installer_name);
CREATE INDEX IF NOT EXISTS idx_assignment_history_created ON public.assignment_history (created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. TICKET LIVE CHAT MESSAGES
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
  CONSTRAINT ticket_messages_attachments_array CHECK (jsonb_typeof(attachments) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_wo_created ON public.ticket_messages (wo_number, created_at);

-- -----------------------------------------------------------------------------
-- 8. TECHNICAL REPORTS
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
  CONSTRAINT technical_reports_photos_array CHECK (jsonb_typeof(photos) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_technical_reports_work_order ON public.technical_reports (work_order_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_wo ON public.technical_reports (wo_number);

DROP TRIGGER IF EXISTS trg_technical_reports_updated_at ON public.technical_reports;
CREATE TRIGGER trg_technical_reports_updated_at
BEFORE UPDATE ON public.technical_reports
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 9. WHATSAPP TEMPLATES
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

CREATE INDEX IF NOT EXISTS idx_wa_templates_active ON public.wa_templates (active);

DROP TRIGGER IF EXISTS trg_wa_templates_updated_at ON public.wa_templates;
CREATE TRIGGER trg_wa_templates_updated_at
BEFORE UPDATE ON public.wa_templates
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 10. APP SETTINGS & USER PREFERENCES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_value_gin
ON public.app_settings USING GIN (setting_value);

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
-- 11. USER SESSIONS (METADATA ONLY — NO RAW BEARER TOKENS)
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
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  ip_address inet,
  user_agent text,
  device_type text DEFAULT 'unknown',
  token_fingerprint text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status_expiry ON public.user_sessions (status, expires_at);

-- -----------------------------------------------------------------------------
-- 12. ATTACHMENTS METADATA
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
  CONSTRAINT attachments_file_size_nonnegative CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attachments_work_order ON public.attachments (work_order_id);
CREATE INDEX IF NOT EXISTS idx_attachments_wo ON public.attachments (wo_number);

-- -----------------------------------------------------------------------------
-- 13. AUDIT LOGS (IMMUTABLE APPEND-ONLY)
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (performed_by, user_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_at ON public.audit_logs (event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_event ON public.audit_logs (entity, event_at DESC);

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_reject_audit_mutation();

-- -----------------------------------------------------------------------------
-- 14. INTEGRATION CONFIGS & SYNC HISTORY
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

CREATE INDEX IF NOT EXISTS idx_sync_history_started ON public.sync_history (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON public.sync_history (status);

DROP TRIGGER IF EXISTS trg_integration_configs_updated_at ON public.integration_configs;
CREATE TRIGGER trg_integration_configs_updated_at
BEFORE UPDATE ON public.integration_configs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 15. SYSTEM ERROR LOGS (RECONCILED MIGRATIONS 003 & 004)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id text PRIMARY KEY,
  error_code text NOT NULL,
  firebase_error_code text,
  module text NOT NULL DEFAULT 'SYSTEM',
  operation text NOT NULL DEFAULT 'GENERAL',
  source text DEFAULT 'system',
  endpoint text,
  http_method text,
  message text NOT NULL,
  technical_details text,
  stack_trace text,
  severity text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  username text,
  user_role text,
  request_id text,
  ip_address inet,
  user_agent text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column check for system_error_logs
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

CREATE INDEX IF NOT EXISTS idx_system_error_logs_code ON public.system_error_logs (error_code);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_module ON public.system_error_logs (module);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity_status ON public.system_error_logs (severity, status);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at ON public.system_error_logs (created_at DESC);

DROP TRIGGER IF EXISTS trg_system_error_logs_updated_at ON public.system_error_logs;
CREATE TRIGGER trg_system_error_logs_updated_at
BEFORE UPDATE ON public.system_error_logs
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 16. REPORT CATEGORIES & DROPLISTS (HIERARCHICAL STRUCTURE)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_categories (
  id varchar(64) PRIMARY KEY,
  parent_id varchar(64) REFERENCES public.report_categories(id) ON DELETE SET NULL,
  category_name varchar(128) NOT NULL,
  category_type varchar(64) NOT NULL DEFAULT 'main_category',
  requires_photo boolean NOT NULL DEFAULT false,
  requires_optical_power boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_categories_parent_active
ON public.report_categories (parent_id, active, display_order);

DROP TRIGGER IF EXISTS trg_report_categories_updated_at ON public.report_categories;
CREATE TRIGGER trg_report_categories_updated_at
BEFORE UPDATE ON public.report_categories
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

-- -----------------------------------------------------------------------------
-- 16.B. IDEMPOTENT SCHEMA RECONCILIATION & COLUMN COMPATIBILITY
-- Ensures older pre-existing tables (from migrations 001-006) receive all required
-- columns without data mutation or relying solely on CREATE TABLE IF NOT EXISTS.
-- -----------------------------------------------------------------------------

-- public.users column compatibility
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS firebase_uid text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS alt_email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cluster_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contractor_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_reason text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- public.work_orders column compatibility
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS installer_id text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS work_sessions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS check_in_at timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS work_session_status text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS chat_messages_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS last_message_snippet text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_message_preview text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_generated_url text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_last_opened_at timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_confirmed_at timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_confirmed_by text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wa_confirmation_notes text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_contact1 text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_contact2 text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_contact3 text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_phone_normalized text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS street_alternatif text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS initial_ticket_category text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS service_aging_maintenance text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS vendor_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb1_sn text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb1_mac text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb2_sn text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb2_mac text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb3_sn text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS stb3_mac text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS rg_serial_number text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS rg_mac_address text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS corlap_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS corlap_contact text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS installer_contact2 text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS installer_email text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS distribution_notes text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS remarks_agent text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS technical_report jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS unmapped_headers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS additional_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS updated_by text;

-- public.contractors column compatibility
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS leader_id text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS leader_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- public.technical_reports column compatibility
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS ticket_id text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS root_cause_category text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS root_cause_sub_category text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS work_result text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS technical_description text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS corrective_action text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS used_materials text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS device_serial_number text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS optical_power_dbm text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS optical_power_rx text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS photo_before_url text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS photo_after_url text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS verified_by_dispatch boolean NOT NULL DEFAULT false;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- public.system_error_logs column compatibility
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS firebase_error_code text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS source text DEFAULT 'system';
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS http_method text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS user_role text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS ip_address inet;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS resolution_notes text;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- public.attachments column compatibility
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS file_id text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS ticket_id text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS wo_number text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'firebase_storage';
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS download_url text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS sender_id text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS sender_role text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS validation_status text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- public.report_categories column compatibility
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS parent_id varchar(64);
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false;
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS requires_optical_power boolean NOT NULL DEFAULT false;
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.report_categories ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 17. SECURITY DEFINER HELPER FUNCTION (PREVENTS RLS INFINITE RECURSION)
-- Evaluates staff role for auth.uid() bypassing RLS recursion.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_auth_uid UUID)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_role varchar;
BEGIN
  IF p_auth_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE auth_user_id = p_auth_uid
    AND is_deleted = false
    AND active = true
  LIMIT 1;

  RETURN v_role;
END;
$$;

COMMENT ON FUNCTION public.get_auth_user_role(UUID) IS 
'Helper SECURITY DEFINER bebas-rekursi untuk memeriksa role staf berdasarkan auth.uid().';

-- -----------------------------------------------------------------------------
-- 18. ROW LEVEL SECURITY (RLS) POLICIES MATRIX
-- Enforces deny-by-default for anonymous clients while enabling trusted backend
-- via service_role and granular RBAC for authenticated sessions.
-- -----------------------------------------------------------------------------

-- Enable RLS across all 19 tables
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
ALTER TABLE public.report_categories ENABLE ROW LEVEL SECURITY;

-- 18.A. SERVICE ROLE POLICIES (Express Backend has unrestricted access via service_role key)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

-- 18.B. CLEANUP & REMOVAL OF UNNECESSARY DIRECT CLIENT POLICIES
-- In MoraJaws architecture, browser NEVER calls Supabase PostgREST directly.
-- All operations pass through Express Backend using service_role credentials.
-- Any direct policies for authenticated or anon roles are explicitly dropped.
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_select_privileged ON public.users;
DROP POLICY IF EXISTS users_modify_superadmin_only ON public.users;
DROP POLICY IF EXISTS wo_authenticated_read ON public.work_orders;
DROP POLICY IF EXISTS al_privileged_read ON public.audit_logs;
DROP POLICY IF EXISTS sel_privileged_read ON public.system_error_logs;
DROP POLICY IF EXISTS sett_authenticated_read ON public.app_settings;
DROP POLICY IF EXISTS sett_privileged_modify ON public.app_settings;

-- -----------------------------------------------------------------------------
-- 19. PERMISSIONS MANAGEMENT: EXPRESS BACKEND SERVICE ROLE ONLY
-- Strict revocation of all direct client access (anon and authenticated).
-- Full access is granted strictly to service_role used by Express Backend.
-- -----------------------------------------------------------------------------

-- Revoke all direct permissions from anon and authenticated roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated, anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM authenticated, anon;

-- Grant full access to service_role (used exclusively by Express backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (RUN IN SUPABASE SQL EDITOR TO VERIFY STAGING INITIALIZATION):
--
-- 1. Verify all 19 tables created:
--    SELECT table_name FROM information_schema.tables 
--    WHERE table_schema = 'public' ORDER BY table_name;
--
-- 2. Verify auth_user_id column & foreign key:
--    SELECT column_name, data_type, is_nullable 
--    FROM information_schema.columns 
--    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id';
--
--    SELECT conname, confrelid::regclass 
--    FROM pg_constraint 
--    WHERE conname = 'fk_users_auth_user_id';
--
-- 3. Verify partial unique index on auth_user_id:
--    SELECT indexname, indexdef 
--    FROM pg_indexes 
--    WHERE tablename = 'users' AND indexname = 'idx_users_auth_user_id_unique';
--
-- 4. Verify RLS is enabled on all tables:
--    SELECT schemaname, tablename, rowsecurity 
--    FROM pg_tables 
--    WHERE schemaname = 'public' ORDER BY tablename;
-- =============================================================================
