-- =============================================================================
-- MORAJAWS MIGRATION 011: PHASE 2.4 SCHEMA RECONCILIATION & SAFETY HARDENING
-- Target Platform: Supabase PostgreSQL (Single Source of Truth)
-- Date: 2026-11-11
-- Phase: MoraJaws Phase 2.4 (Application & Schema Reconciliation)
-- Status: NON-DESTRUCTIVE RECONCILIATION & TRIGGER BUGFIX
--
-- PURPOSE:
-- 1. Fix Legacy WO Mutation Trigger (fn_protect_legacy_soft_deleted_wo):
--    - BEFORE DELETE triggers returning NEW (which is NULL) suppress row deletion.
--    - Fix: Evaluate TG_OP; return OLD on DELETE to allow standard deletions,
--      return NEW on UPDATE to allow standard updates.
--    - Enforce absolute protection on the 3 protected legacy soft-deleted WOs:
--      * 'wo_1793825457141_u4bnht' ('WO-EXPRESS-TEST-1793825456810')
--      * 'wo_imp_1793825458959_4i4f1h' ('WO-DUP-TEST-1793825458804')
--      * 'wo_imp_1793825458959_262dei' ('WO-DUP-TEST-1793825458804-UNIQUE')
-- 2. Technical Reports Schema & Index Reconciliation:
--    - Verify public.technical_reports matches TypeScript model:
--      submitted_by stores technician/installer identity.
--      work_result stores completion status.
--      photos jsonb stores report attachments.
--    - Create indexes for fast lookup by submitted_by, work_order_id, and verified status.
-- 3. Security Hardening:
--    - Add explicit `SET search_path = public, pg_temp` on all SECURITY DEFINER functions.
--    - Explicitly grant EXECUTE only to service_role, revoking from anon/authenticated/public.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FIX TRIGGER FUNCTION: fn_protect_legacy_soft_deleted_wo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_legacy_soft_deleted_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strict Protection Check on 3 Protected Legacy Work Orders
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

  -- CRITICAL BUGFIX (Phase 2.4):
  -- In PostgreSQL BEFORE DELETE triggers, NEW is always NULL.
  -- Returning NEW suppresses the DELETE silently (0 rows deleted).
  -- Returning OLD permits normal non-protected rows to be deleted.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- For UPDATE triggers, return NEW to persist modifications.
  RETURN NEW;
END;
$$;

-- Re-bind trigger to public.work_orders
DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();

-- -----------------------------------------------------------------------------
-- 2. HARDEN SECURITY DEFINER FUNCTIONS WITH SEARCH_PATH & EXECUTE PRIVILEGES
-- -----------------------------------------------------------------------------
-- A. Update timestamp trigger
CREATE OR REPLACE FUNCTION public.morajaws_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- B. Audit log rejection trigger
CREATE OR REPLACE FUNCTION public.morajaws_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'MORAJAWS_AUDIT_IMMUTABLE: audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$;

-- C. Explicit EXECUTE privileges restricted to service_role
REVOKE ALL ON FUNCTION public.fn_protect_legacy_soft_deleted_wo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_protect_legacy_soft_deleted_wo() TO service_role;

REVOKE ALL ON FUNCTION public.morajaws_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morajaws_set_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.morajaws_reject_audit_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morajaws_reject_audit_mutation() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. TECHNICAL REPORTS INDEXES & CONSTRAINTS ALIGNMENT
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_technical_reports_submitted_by
  ON public.technical_reports (submitted_by);

CREATE INDEX IF NOT EXISTS idx_technical_reports_verification
  ON public.technical_reports (verified_by_dispatch, verified_at);

CREATE INDEX IF NOT EXISTS idx_technical_reports_work_order_id
  ON public.technical_reports (work_order_id);

CREATE INDEX IF NOT EXISTS idx_technical_reports_wo_number
  ON public.technical_reports (wo_number);

COMMIT;
