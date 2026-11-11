-- =============================================================================
-- MORAJAWS MIGRATION 012: PHASE 2.4.1 ATOMIC TECHNICAL REPORT PERSISTENCE
-- Target Platform: Supabase PostgreSQL (Single Source of Truth)
-- Date: 2026-11-11
-- Phase: MoraJaws Phase 2.4.1 (Critical Remediation & End-to-End Verification)
-- Status: NON-DESTRUCTIVE ATOMIC FUNCTION & RECONCILIATION
--
-- PURPOSE:
-- 1. Preflight Schema Validation:
--    - Verify work_orders, technical_reports, and audit_logs tables exist.
-- 2. Atomic Technical Report Persistence Function (fn_submit_technical_report_atomic):
--    - Atomically performs in one PostgreSQL transaction:
--      a. Locks and validates existence of target Work Order.
--      b. Validates user identity and role-based permissions (installers must be assigned).
--      c. Validates mandatory Technical Report fields (work_result, description, action).
--      d. Upserts canonical public.technical_reports record.
--      e. Updates public.work_orders (installer/agent status, checkout time, session duration, JSONB payload).
--      f. Appends immutable audit entry to public.audit_logs.
--      g. Returns full composite result payload.
-- 3. Security Hardening:
--    - Strict search_path = public, pg_temp.
--    - Restricted EXECUTE granted strictly to service_role; revoked from PUBLIC, anon, authenticated.
-- 4. Post-Migration Verification Query.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PREFLIGHT SCHEMA VALIDATION
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_orders') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: public.work_orders table does not exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'technical_reports') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: public.technical_reports table does not exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: public.audit_logs table does not exist.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ATOMIC FUNCTION: fn_submit_technical_report_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_submit_technical_report_atomic(
  p_work_order_id text,
  p_report_data jsonb,
  p_submitted_by text,
  p_submitted_by_id text DEFAULT NULL,
  p_user_role text DEFAULT 'installer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wo record;
  v_report_id text;
  v_work_result text;
  v_tech_desc text;
  v_corr_action text;
  v_next_installer_status text;
  v_next_agent_status text;
  v_now timestamptz := now();
  v_now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_duration_min integer;
  v_duration_formatted text;
  v_session_status text;
  v_sessions jsonb;
  v_audit_id text;
  v_result jsonb;
  v_is_assigned boolean := false;
  v_installer_clean text;
  v_user_clean text;
BEGIN
  -- A. Validate input arguments
  IF p_work_order_id IS NULL OR trim(p_work_order_id) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Work order identifier cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF p_report_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_REPORT_DATA: Technical report payload cannot be null' USING ERRCODE = '22023';
  END IF;

  v_work_result := trim(COALESCE(p_report_data->>'workResult', ''));
  v_tech_desc := trim(COALESCE(p_report_data->>'technicalDescription', ''));
  v_corr_action := trim(COALESCE(p_report_data->>'correctiveAction', ''));

  IF v_work_result = '' THEN
    RAISE EXCEPTION 'INVALID_REPORT_DATA: Hasil pengerjaan (workResult) wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF v_tech_desc = '' THEN
    RAISE EXCEPTION 'INVALID_REPORT_DATA: Deskripsi teknis kendala (technicalDescription) wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF v_corr_action = '' THEN
    RAISE EXCEPTION 'INVALID_REPORT_DATA: Tindakan perbaikan (correctiveAction) wajib diisi' USING ERRCODE = '22023';
  END IF;

  -- B. Retrieve and lock target Work Order
  SELECT * INTO v_wo
  FROM public.work_orders
  WHERE id = p_work_order_id OR wo_number = p_work_order_id
  FOR UPDATE;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND: Work Order % tidak ditemukan di database', p_work_order_id USING ERRCODE = 'P0002';
  END IF;

  -- C. Validate Role and Installer Assignment Scoping
  IF lower(COALESCE(p_user_role, '')) = 'installer' THEN
    v_installer_clean := lower(trim(COALESCE(v_wo.installer_name, '')));
    v_user_clean := lower(trim(COALESCE(p_submitted_by, '')));

    IF v_installer_clean = v_user_clean
       OR (length(v_user_clean) > 2 AND v_installer_clean LIKE '%' || v_user_clean || '%')
       OR (length(v_installer_clean) > 2 AND v_user_clean LIKE '%' || v_installer_clean || '%') THEN
      v_is_assigned := true;
    END IF;

    IF NOT v_is_assigned THEN
      RAISE EXCEPTION 'FORBIDDEN_SCOPE: Teknisi % tidak ditugaskan pada Work Order %', p_submitted_by, v_wo.wo_number USING ERRCODE = '42501';
    END IF;
  END IF;

  -- D. Determine target report ID
  v_report_id := COALESCE(
    p_report_data->>'id',
    'rep_' || floor(extract(epoch from v_now) * 1000)::text || '_' || substr(md5(random()::text), 1, 6)
  );

  -- E. Determine Work Order Status transitions
  IF v_work_result = 'Tidak Berhasil' THEN
    v_next_installer_status := 'Failed / Cancelled';
    v_next_agent_status := v_wo.status_wo_agent;
  ELSIF v_work_result = 'Pekerjaan Tertunda' THEN
    v_next_installer_status := 'Pending Technical';
    v_next_agent_status := v_wo.status_wo_agent;
  ELSE
    v_next_installer_status := 'Completed';
    v_next_agent_status := 'Resolved';
  END IF;

  -- F. Calculate Work Duration & Automatic Checkout if applicable
  v_check_in := v_wo.check_in_at;
  v_check_out := v_wo.check_out_at;
  v_duration_min := v_wo.work_duration_minutes;
  v_duration_formatted := v_wo.work_duration_formatted;
  v_session_status := v_wo.work_session_status;
  v_sessions := COALESCE(v_wo.work_sessions, '[]'::jsonb);

  IF v_check_in IS NOT NULL AND (v_check_out IS NULL OR v_session_status = 'Sedang Dikerjakan') THEN
    v_check_out := v_now;
    v_session_status := 'Selesai';
    v_duration_min := GREATEST(1, round(extract(epoch from (v_now - v_check_in)) / 60)::integer);
    
    IF v_duration_min >= 60 THEN
      v_duration_formatted := (v_duration_min / 60)::text || ' jam ' || (v_duration_min % 60)::text || ' menit';
    ELSE
      v_duration_formatted := v_duration_min::text || ' menit';
    END IF;

    -- Update session array
    IF jsonb_array_length(v_sessions) > 0 THEN
      v_sessions := jsonb_set(
        v_sessions,
        array[(jsonb_array_length(v_sessions) - 1)::text, 'checkOutAt'],
        to_jsonb(v_now_iso)
      );
      v_sessions := jsonb_set(
        v_sessions,
        array[(jsonb_array_length(v_sessions) - 1)::text, 'status'],
        '"Selesai"'::jsonb
      );
      v_sessions := jsonb_set(
        v_sessions,
        array[(jsonb_array_length(v_sessions) - 1)::text, 'durationMinutes'],
        to_jsonb(v_duration_min)
      );
      v_sessions := jsonb_set(
        v_sessions,
        array[(jsonb_array_length(v_sessions) - 1)::text, 'durationFormatted'],
        to_jsonb(v_duration_formatted)
      );
    ELSE
      v_sessions := jsonb_build_array(
        jsonb_build_object(
          'sessionId', 'ws_' || floor(extract(epoch from v_now) * 1000)::text,
          'checkInAt', to_char(v_check_in AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'checkOutAt', v_now_iso,
          'durationMinutes', v_duration_min,
          'durationFormatted', v_duration_formatted,
          'status', 'Selesai'
        )
      );
    END IF;
  END IF;

  -- G. Upsert into canonical public.technical_reports
  INSERT INTO public.technical_reports (
    id,
    work_order_id,
    ticket_id,
    wo_number,
    main_category,
    root_cause,
    sub_category,
    root_cause_category,
    root_cause_sub_category,
    work_result,
    technical_description,
    corrective_action,
    used_materials,
    device_serial_number,
    optical_power_dbm,
    optical_power_rx,
    photo_before_url,
    photo_after_url,
    photos,
    start_time,
    end_time,
    additional_notes,
    verified_by_dispatch,
    verified_at,
    verified_by,
    submitted_by,
    submitted_at,
    payload,
    created_at,
    updated_at
  ) VALUES (
    v_report_id,
    v_wo.id,
    v_wo.id,
    v_wo.wo_number,
    p_report_data->>'mainCategory',
    p_report_data->>'rootCause',
    p_report_data->>'subCategory',
    p_report_data->>'rootCauseCategory',
    p_report_data->>'rootCauseSubCategory',
    v_work_result,
    v_tech_desc,
    v_corr_action,
    p_report_data->>'usedMaterials',
    p_report_data->>'deviceSerialNumber',
    p_report_data->>'opticalPowerDbm',
    p_report_data->>'opticalPowerRx',
    p_report_data->>'photoBeforeUrl',
    p_report_data->>'photoAfterUrl',
    COALESCE(p_report_data->'photos', '[]'::jsonb),
    CASE WHEN p_report_data->>'startTime' IS NOT NULL THEN (p_report_data->>'startTime')::timestamptz ELSE NULL END,
    CASE WHEN p_report_data->>'endTime' IS NOT NULL THEN (p_report_data->>'endTime')::timestamptz ELSE NULL END,
    p_report_data->>'additionalNotes',
    COALESCE((p_report_data->>'verifiedByDispatch')::boolean, false),
    CASE WHEN p_report_data->>'verifiedAt' IS NOT NULL THEN (p_report_data->>'verifiedAt')::timestamptz ELSE NULL END,
    p_report_data->>'verifiedBy',
    p_submitted_by,
    v_now,
    jsonb_build_object(
      'clientReportId', v_report_id,
      'submittedBy', p_submitted_by,
      'submittedById', p_submitted_by_id,
      'submittedAt', v_now_iso,
      'workResult', v_work_result
    ),
    v_now,
    v_now
  )
  ON CONFLICT (id) DO UPDATE SET
    main_category = EXCLUDED.main_category,
    root_cause = EXCLUDED.root_cause,
    sub_category = EXCLUDED.sub_category,
    root_cause_category = EXCLUDED.root_cause_category,
    root_cause_sub_category = EXCLUDED.root_cause_sub_category,
    work_result = EXCLUDED.work_result,
    technical_description = EXCLUDED.technical_description,
    corrective_action = EXCLUDED.corrective_action,
    used_materials = EXCLUDED.used_materials,
    device_serial_number = EXCLUDED.device_serial_number,
    optical_power_dbm = EXCLUDED.optical_power_dbm,
    optical_power_rx = EXCLUDED.optical_power_rx,
    photo_before_url = EXCLUDED.photo_before_url,
    photo_after_url = EXCLUDED.photo_after_url,
    photos = EXCLUDED.photos,
    additional_notes = EXCLUDED.additional_notes,
    updated_at = v_now;

  -- H. Update public.work_orders
  UPDATE public.work_orders
  SET
    status_wo_installer = v_next_installer_status,
    status_wo_agent = v_next_agent_status,
    check_out_at = v_check_out,
    work_duration_minutes = v_duration_min,
    work_duration_formatted = v_duration_formatted,
    work_session_status = v_session_status,
    work_sessions = v_sessions,
    payload = jsonb_set(
      COALESCE(payload, '{}'::jsonb),
      '{technicalReport}',
      jsonb_build_object(
        'id', v_report_id,
        'ticketId', v_wo.id,
        'woNumber', v_wo.wo_number,
        'mainCategory', p_report_data->>'mainCategory',
        'rootCause', p_report_data->>'rootCause',
        'subCategory', p_report_data->>'subCategory',
        'workResult', v_work_result,
        'technicalDescription', v_tech_desc,
        'correctiveAction', v_corr_action,
        'usedMaterials', p_report_data->>'usedMaterials',
        'deviceSerialNumber', p_report_data->>'deviceSerialNumber',
        'opticalPowerDbm', p_report_data->>'opticalPowerDbm',
        'photoBeforeUrl', p_report_data->>'photoBeforeUrl',
        'photoAfterUrl', p_report_data->>'photoAfterUrl',
        'photos', COALESCE(p_report_data->'photos', '[]'::jsonb),
        'additionalNotes', p_report_data->>'additionalNotes',
        'submittedBy', p_submitted_by,
        'submittedAt', v_now_iso
      )
    ),
    updated_at = v_now,
    updated_by = p_submitted_by
  WHERE id = v_wo.id;

  -- I. Record immutable Audit Log
  v_audit_id := 'aud_' || floor(extract(epoch from v_now) * 1000)::text || '_' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.audit_logs (
    id,
    action,
    entity,
    entity_id,
    details,
    previous_state,
    new_state,
    performed_by_id,
    performed_by,
    user_role,
    created_at
  ) VALUES (
    v_audit_id,
    'Technical Report Submitted',
    'report',
    v_wo.wo_number,
    format('Laporan teknis diserahkan oleh %s untuk WO %s (%s)', p_submitted_by, v_wo.wo_number, v_work_result),
    jsonb_build_object('statusWOInstaller', v_wo.status_wo_installer, 'statusWOAgent', v_wo.status_wo_agent),
    jsonb_build_object('statusWOInstaller', v_next_installer_status, 'statusWOAgent', v_next_agent_status, 'reportId', v_report_id),
    p_submitted_by_id,
    p_submitted_by,
    COALESCE(p_user_role, 'installer'),
    v_now
  );

  -- J. Construct and return result payload
  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'work_order_id', v_wo.id,
    'wo_number', v_wo.wo_number,
    'work_result', v_work_result,
    'status_wo_installer', v_next_installer_status,
    'status_wo_agent', v_next_agent_status,
    'audit_log_id', v_audit_id,
    'submitted_at', v_now_iso
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. PERMISSIONS & SEARCH_PATH HARDENING
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_submit_technical_report_atomic(text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_technical_report_atomic(text, jsonb, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_submit_technical_report_atomic'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'POSTMIGRATION_FAILED: fn_submit_technical_report_atomic was not registered.';
  END IF;
END $$;

COMMIT;
