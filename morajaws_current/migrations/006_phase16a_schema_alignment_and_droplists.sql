-- =============================================================================
-- MORAJAWS MIGRATION 006: SCHEMA ALIGNMENT, PERFORMANCE INDEXES & FULL RLS MATRIX
-- Description: Draf usulan penyempurnaan skema PostgreSQL Supabase Fase 16A:
--              1. Composite B-Tree Indexes untuk Kalender, Dispatch, & Scoping RBAC
--              2. GIN Index untuk JSONB app_settings & konfigurasi droplist dinamis
--              3. Tabel opsional public.report_categories untuk droplist hierarkis
--              4. Matriks lengkap Row Level Security (RLS) bebas-rekursi untuk seluruh entitas
--              5. Enforcing Immutability untuk audit_logs & 3 protected work orders
-- Status: DRAFT PROPOSAL — DILARANG DIEKSEKUSI PADA DATABASE PRODUKSI TANPA PERSETUJUAN PEMILIK.
-- Target Database: Supabase PostgreSQL
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. COMPOSITE INDEXES UNTUK PERFORMA QUERY & DISPATCH REAL-TIME
-- =============================================================================

-- 1.A. Index Kalender & Penjadwalan WO (Asia/Jakarta Appointment Date + Slot)
CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_calendar
ON public.work_orders (appointment_date, slot_time, status_wo_agent)
WHERE is_deleted = false;

-- 1.B. Index Scoping Leader (Contractor + Area + Appointment Date)
CREATE INDEX IF NOT EXISTS idx_work_orders_leader_scope
ON public.work_orders (contractor_id, area, appointment_date)
WHERE is_deleted = false;

-- 1.C. Index Scoping Installer (Assigned Installer + Appointment Date)
CREATE INDEX IF NOT EXISTS idx_work_orders_installer_scope
ON public.work_orders (installer_id, appointment_date)
WHERE is_deleted = false;

-- 1.D. Index Pencarian Cepat Normalisasi WO Number
CREATE INDEX IF NOT EXISTS idx_work_orders_normalized_wo
ON public.work_orders (wo_number)
WHERE is_deleted = false;

-- 1.E. GIN Index untuk Pencarian Kunci Dinamis dalam JSONB app_settings
CREATE INDEX IF NOT EXISTS idx_app_settings_value_gin
ON public.app_settings USING GIN (setting_value);

-- 1.F. Index Audit Logs berdasarkan Entitas dan Tanggal
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
ON public.audit_logs (entity_type, created_at DESC);

-- =============================================================================
-- 2. TABEL OPSIONAL: HIERARCHICAL REPORT CATEGORIES & DROPLISTS
-- (Alternatif terstruktur terhadap penyimpanan JSONB di app_settings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.report_categories (
  id VARCHAR(64) PRIMARY KEY,
  parent_id VARCHAR(64) REFERENCES public.report_categories(id) ON DELETE SET NULL,
  category_name VARCHAR(128) NOT NULL,
  category_type VARCHAR(64) NOT NULL DEFAULT 'main_category', -- main_category, sub_category, reason, corrective_action
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_optical_power BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_categories_parent_active
ON public.report_categories (parent_id, active, display_order);

-- =============================================================================
-- 3. TRIGGER KEAMANAN: PROTEKSI 3 WO PRODUKSI DARI MUTASI DATABASE
-- =============================================================================

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
    RAISE EXCEPTION 'PROTECTED_RECORD_MUTATION_FORBIDDEN: Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang dimutasi.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
BEFORE UPDATE OR DELETE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();

-- =============================================================================
-- 4. MATRIKS ROW LEVEL SECURITY (RLS) BEBAS REKURSI
-- =============================================================================

-- 4.A. TABEL WORK_ORDERS
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_service_role_all ON public.work_orders;
CREATE POLICY wo_service_role_all ON public.work_orders
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wo_authenticated_read ON public.work_orders;
CREATE POLICY wo_authenticated_read ON public.work_orders
FOR SELECT TO authenticated
USING (
  public.get_auth_user_role(auth.uid()) IN ('super_admin', 'dispatch', 'management_data', 'it_support')
  OR (
    public.get_auth_user_role(auth.uid()) = 'leader'
    AND contractor_id IN (SELECT contractor_id FROM public.users WHERE auth_user_id = auth.uid() AND is_deleted = false)
  )
  OR (
    public.get_auth_user_role(auth.uid()) = 'installer'
    AND installer_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid() AND is_deleted = false)
  )
);

-- 4.B. TABEL ASSIGNMENT_HISTORY (APPEND-ONLY)
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ah_service_role_all ON public.assignment_history;
CREATE POLICY ah_service_role_all ON public.assignment_history
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ah_authenticated_read ON public.assignment_history;
CREATE POLICY ah_authenticated_read ON public.assignment_history
FOR SELECT TO authenticated USING (true);

-- Revoke UPDATE & DELETE untuk menjaga integritas append-only
REVOKE UPDATE, DELETE ON public.assignment_history FROM authenticated, anon;

-- 4.C. TABEL TICKET_MESSAGES (LIVE CHAT)
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tm_service_role_all ON public.ticket_messages;
CREATE POLICY tm_service_role_all ON public.ticket_messages
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tm_authenticated_read ON public.ticket_messages;
CREATE POLICY tm_authenticated_read ON public.ticket_messages
FOR SELECT TO authenticated USING (true);

-- 4.D. TABEL AUDIT_LOGS & SYSTEM_ERROR_LOGS (IMMUTABLE LOGS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS al_service_role_all ON public.audit_logs;
CREATE POLICY al_service_role_all ON public.audit_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sel_service_role_all ON public.system_error_logs;
CREATE POLICY sel_service_role_all ON public.system_error_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS al_privileged_read ON public.audit_logs;
CREATE POLICY al_privileged_read ON public.audit_logs
FOR SELECT TO authenticated
USING (public.get_auth_user_role(auth.uid()) IN ('super_admin', 'it_support'));

DROP POLICY IF EXISTS sel_privileged_read ON public.system_error_logs;
CREATE POLICY sel_privileged_read ON public.system_error_logs
FOR SELECT TO authenticated
USING (public.get_auth_user_role(auth.uid()) IN ('super_admin', 'it_support'));

-- Audit trail dilarang keras diubah atau dihapus oleh siapapun
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.system_error_logs FROM authenticated, anon;

-- 4.E. TABEL APP_SETTINGS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sett_service_role_all ON public.app_settings;
CREATE POLICY sett_service_role_all ON public.app_settings
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sett_authenticated_read ON public.app_settings;
CREATE POLICY sett_authenticated_read ON public.app_settings
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sett_privileged_modify ON public.app_settings;
CREATE POLICY sett_privileged_modify ON public.app_settings
FOR ALL TO authenticated
USING (public.get_auth_user_role(auth.uid()) IN ('super_admin', 'it_support'))
WITH CHECK (public.get_auth_user_role(auth.uid()) IN ('super_admin', 'it_support'));

-- =============================================================================
-- 5. GRANT PERMISSIONS KE SERVICE_ROLE
-- =============================================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;

-- =============================================================================
-- ROLLBACK SCRIPT (IF NEEDED IN RECOVERY SCENARIO):
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
-- DROP FUNCTION IF EXISTS public.fn_protect_legacy_soft_deleted_wo();
-- DROP INDEX IF EXISTS idx_work_orders_appointment_calendar;
-- DROP INDEX IF EXISTS idx_work_orders_leader_scope;
-- DROP INDEX IF EXISTS idx_work_orders_installer_scope;
-- DROP INDEX IF EXISTS idx_work_orders_normalized_wo;
-- DROP INDEX IF EXISTS idx_app_settings_value_gin;
-- DROP INDEX IF EXISTS idx_audit_logs_entity_created;
-- DROP TABLE IF EXISTS public.report_categories CASCADE;
-- =============================================================================
