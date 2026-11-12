-- ==============================================================================
-- MoraJaws Migration 017: Phase 16B.2 / 17B.0 Atomic Import & Record Protection
-- Forward-only database migration:
-- 1. Idempotent tracking schema & unique constraint on idempotency_key
-- 2. Canonical work order number normalization unique index (v2)
-- 3. Defense-in-depth trigger protecting legacy soft-deleted work orders
-- 4. Atomic PostgreSQL batch import RPC (morajaws_import_work_orders_atomic)
-- 5. Strict service_role privileges lockdown
--
-- SAFETY NOTICE:
-- DO NOT EXECUTE ON PRODUCTION OR STAGING WITHOUT EXPLICIT APPROVAL AND
-- READ-ONLY PREFLIGHT EVIDENCE VERIFICATION.
-- ==============================================================================

BEGIN;

-- 1. Tracking Table: public.work_order_imports
CREATE TABLE IF NOT EXISTS public.work_order_imports (
  import_id text PRIMARY KEY,
  filename text NOT NULL,
  sheet_name text,
  uploaded_by text NOT NULL,
  uploaded_by_role text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATING', 'PROCESSING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')),
  duplicate_policy text NOT NULL DEFAULT 'skip' CHECK (duplicate_policy IN ('skip', 'update_allowed', 'review')),
  error_summary text,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for work_order_imports
CREATE INDEX IF NOT EXISTS idx_wo_imports_uploaded_at
  ON public.work_order_imports (uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wo_imports_status
  ON public.work_order_imports (status);

CREATE INDEX IF NOT EXISTS idx_wo_imports_uploaded_by
  ON public.work_order_imports (uploaded_by);

-- 2. Safe Date Parsing Function
CREATE OR REPLACE FUNCTION public.morajaws_safe_date(val text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF val IS NULL OR btrim(val) = '' OR btrim(val) = '-' OR val = 'null' OR val = 'undefined' THEN
    RETURN NULL;
  END IF;
  -- ISO format: YYYY-MM-DD
  IF val ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substring(val from 1 for 10)::date;
  END IF;
  -- Delimited format: DD/MM/YYYY
  IF val ~ '^\d{1,2}/\d{1,2}/\d{4}' THEN
    RETURN to_date(val, 'DD/MM/YYYY');
  END IF;
  -- Delimited format: DD-MM-YYYY
  IF val ~ '^\d{1,2}-\d{1,2}-\d{4}' THEN
    RETURN to_date(val, 'DD-MM-YYYY');
  END IF;
  RETURN val::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3. Canonical Work Order Unique Index (v2)
-- Retains existing index while guaranteeing verified portable whitespace regex E'\\s+'
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_wo_canonical_v2
ON public.work_orders (lower(regexp_replace(btrim(wo_number), E'\\s+', '', 'g')))
WHERE wo_number IS NOT NULL AND btrim(wo_number) <> '';

-- 4. Defense-in-Depth Trigger: Immutability of Protected Work Orders
-- Blocks UPDATE and DELETE on the 3 historical records by ID or canonical WO number
CREATE OR REPLACE FUNCTION public.fn_protect_legacy_soft_deleted_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_can_wo text;
BEGIN
  v_old_can_wo := lower(regexp_replace(btrim(COALESCE(OLD.wo_number, '')), E'\\s+', '', 'g'));

  IF OLD.id IN (
    'wo_1793825457141_u4bnht',
    'wo_imp_1793825458959_4i4f1h',
    'wo_imp_1793825458959_262dei'
  ) OR v_old_can_wo IN (
    'wo-express-test-1793825456810',
    'wo-dup-test-1793825458804',
    'wo-dup-test-1793825458804-unique'
  ) THEN
    RAISE EXCEPTION 'MORAJAWS_PROTECTED_RECORD: Tiga WO produksi yang dilindungi dilarang dimutasi atau dihapus (ID: %, WO: %)', OLD.id, OLD.wo_number;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();

-- 5. Transactional Batch Work Order Import RPC
CREATE OR REPLACE FUNCTION public.morajaws_import_work_orders_atomic(
  p_import_id text,
  p_filename text,
  p_sheet_name text,
  p_uploaded_by text,
  p_uploaded_by_role text,
  p_duplicate_policy text, -- 'skip' | 'update_allowed' | 'review'
  p_idempotency_key text,
  p_tickets jsonb,         -- Array of mapped work order objects
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_import record;
  v_total_submitted integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_skipped_duplicates integer := 0;
  v_invalid_count integer := 0;
  v_failed_count integer := 0;
  v_final_status text := 'FAILED';

  v_duplicate_in_file text[] := ARRAY[]::text[];
  v_duplicate_existing text[] := ARRAY[]::text[];
  v_invalid_rows jsonb := '[]'::jsonb;
  v_failed_errors text[] := ARRAY[]::text[];
  v_errors jsonb := '[]'::jsonb;

  v_seen_keys text[] := ARRAY[]::text[];

  v_ticket jsonb;
  v_idx integer := 0;
  v_raw_wo text;
  v_norm_wo text;
  v_can_wo text;
  v_street text;
  v_address text;
  v_lat text;
  v_lng text;
  v_has_coords boolean;
  v_is_protected boolean;

  v_existing_id text;
  v_existing_wo text;

  v_new_id text;
  v_app_date date;
  v_slot_time text;
  v_rem_agent text;
  v_cust_phone text;
  v_ticket_cat text;
BEGIN
  -- Validate tickets array
  IF p_tickets IS NULL OR jsonb_typeof(p_tickets) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'FAILED',
      'importId', p_import_id,
      'error', 'Daftar tickets wajib berupa array JSON.',
      'code', 'INVALID_INPUT'
    );
  END IF;

  v_total_submitted := jsonb_array_length(p_tickets);
  IF v_total_submitted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'FAILED',
      'importId', p_import_id,
      'error', 'Import dibatalkan karena tidak ada baris WO yang dikirim.',
      'code', 'EMPTY_IMPORT'
    );
  END IF;

  -- 1. Atomic Idempotency Claim & Lock
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT import_id, status, total_rows, valid_rows, invalid_rows, inserted_rows,
           updated_rows, duplicate_rows, failed_rows, error_summary, error_details
    INTO v_existing_import
    FROM public.work_order_imports
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_import.status IN ('SUCCESS', 'PARTIAL_SUCCESS') THEN
        RETURN jsonb_build_object(
          'success', (v_existing_import.status = 'SUCCESS'),
          'status', v_existing_import.status,
          'importId', v_existing_import.import_id,
          'totalSubmitted', v_existing_import.total_rows,
          'imported', v_existing_import.inserted_rows,
          'updatedCount', v_existing_import.updated_rows,
          'skippedDuplicates', v_existing_import.duplicate_rows,
          'invalidCount', v_existing_import.invalid_rows,
          'failedCount', v_existing_import.failed_rows,
          'duplicateInFileWoNumbers', '[]'::jsonb,
          'duplicateExistingWoNumbers', '[]'::jsonb,
          'invalidRows', '[]'::jsonb,
          'failedErrors', '[]'::jsonb,
          'errors', v_existing_import.error_details,
          'isIdempotentReplay', true
        );
      ELSIF v_existing_import.status IN ('PROCESSING', 'PENDING', 'VALIDATING') THEN
        RAISE EXCEPTION 'IMPORT_IN_PROGRESS: Import dengan idempotency key % sedang diproses.', p_idempotency_key;
      END IF;
    END IF;

    -- Record initial PROCESSING claim
    INSERT INTO public.work_order_imports (
      import_id, filename, sheet_name, uploaded_by, uploaded_by_role,
      uploaded_at, total_rows, status, duplicate_policy, idempotency_key, metadata
    ) VALUES (
      p_import_id, p_filename, p_sheet_name, p_uploaded_by, p_uploaded_by_role,
      now(), v_total_submitted, 'PROCESSING', p_duplicate_policy, p_idempotency_key, p_metadata
    )
    ON CONFLICT (import_id) DO UPDATE
    SET status = 'PROCESSING', updated_at = now();
  ELSE
    -- No idempotency key provided
    INSERT INTO public.work_order_imports (
      import_id, filename, sheet_name, uploaded_by, uploaded_by_role,
      uploaded_at, total_rows, status, duplicate_policy, idempotency_key, metadata
    ) VALUES (
      p_import_id, p_filename, p_sheet_name, p_uploaded_by, p_uploaded_by_role,
      now(), v_total_submitted, 'PROCESSING', p_duplicate_policy, NULL, p_metadata
    )
    ON CONFLICT (import_id) DO UPDATE
    SET status = 'PROCESSING', updated_at = now();
  END IF;

  -- 2. Temporary Working Table
  CREATE TEMP TABLE _import_stage (
    row_idx integer,
    ticket_data jsonb,
    norm_wo text,
    can_wo text
  ) ON COMMIT DROP;

  -- 3. Ingest and Validate Each Ticket
  FOR v_ticket IN SELECT * FROM jsonb_array_elements(p_tickets)
  LOOP
    v_idx := v_idx + 1;
    v_raw_wo := COALESCE(v_ticket->>'woNumber', v_ticket->>'wo_number', v_ticket->>'workOrderNumber', v_ticket->>'work_order_number');
    
    v_norm_wo := upper(regexp_replace(btrim(COALESCE(v_raw_wo, '')), E'\\s+', '', 'g'));
    v_can_wo := lower(regexp_replace(btrim(COALESCE(v_raw_wo, '')), E'\\s+', '', 'g'));

    IF v_norm_wo IS NULL OR length(v_norm_wo) < 3 THEN
      v_invalid_count := v_invalid_count + 1;
      v_invalid_rows := v_invalid_rows || jsonb_build_object('index', v_idx, 'reason', 'Nomor WO kosong atau kurang dari 3 karakter.', 'rawWo', v_raw_wo);
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'woNumber', 'code', 'INVALID_WO', 'message', 'Nomor WO kosong atau kurang dari 3 karakter.');
      CONTINUE;
    END IF;

    -- Location validation: street_name or address or coordinates
    v_street := btrim(COALESCE(v_ticket->>'streetName', v_ticket->>'street_name', ''));
    v_address := btrim(COALESCE(v_ticket->>'address', ''));
    v_lat := btrim(COALESCE(v_ticket->>'latitude', ''));
    v_lng := btrim(COALESCE(v_ticket->>'longitude', ''));
    v_has_coords := (v_lat <> '' AND v_lat <> '0' AND v_lng <> '' AND v_lng <> '0');

    IF v_street = '' AND v_address = '' AND NOT v_has_coords THEN
      IF p_duplicate_policy <> 'update_allowed' OR NOT EXISTS (
        SELECT 1 FROM public.work_orders WHERE lower(regexp_replace(btrim(wo_number), E'\\s+', '', 'g')) = v_can_wo
      ) THEN
        v_invalid_count := v_invalid_count + 1;
        v_invalid_rows := v_invalid_rows || jsonb_build_object('index', v_idx, 'reason', 'Baris tidak memiliki alamat jalan atau pasangan koordinat.', 'rawWo', v_raw_wo);
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'address', 'code', 'MISSING_LOCATION', 'message', 'Alamat atau koordinat wajib tersedia untuk penugasan WO.');
        CONTINUE;
      END IF;
    END IF;

    -- Intra-file duplicate detection
    IF v_can_wo = ANY(v_seen_keys) THEN
      v_skipped_duplicates := v_skipped_duplicates + 1;
      v_duplicate_in_file := array_append(v_duplicate_in_file, v_norm_wo);
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'woNumber', 'code', 'DUPLICATE_IN_FILE', 'message', 'Nomor WO duplikat di dalam berkas.');
      CONTINUE;
    END IF;

    v_seen_keys := array_append(v_seen_keys, v_can_wo);

    INSERT INTO _import_stage (row_idx, ticket_data, norm_wo, can_wo)
    VALUES (v_idx, v_ticket, v_norm_wo, v_can_wo);
  END LOOP;

  -- If no valid candidates: finalize and return FAILED
  IF v_seen_keys = ARRAY[]::text[] THEN
    v_final_status := 'FAILED';
    UPDATE public.work_order_imports
    SET
      valid_rows = 0,
      invalid_rows = v_invalid_count,
      inserted_rows = 0,
      updated_rows = 0,
      duplicate_rows = v_skipped_duplicates,
      failed_rows = v_failed_count,
      status = 'FAILED',
      error_summary = 'Tidak ada baris WO valid untuk diproses.',
      error_details = v_errors,
      updated_at = now()
    WHERE import_id = p_import_id;

    RETURN jsonb_build_object(
      'success', false,
      'status', 'FAILED',
      'importId', p_import_id,
      'totalSubmitted', v_total_submitted,
      'imported', 0,
      'updatedCount', 0,
      'skippedDuplicates', v_skipped_duplicates,
      'invalidCount', v_invalid_count,
      'failedCount', v_failed_count,
      'duplicateInFileWoNumbers', to_jsonb(v_duplicate_in_file),
      'duplicateExistingWoNumbers', '[]'::jsonb,
      'invalidRows', v_invalid_rows,
      'failedErrors', '[]'::jsonb,
      'errors', v_errors
    );
  END IF;

  -- 4. Lock existing rows for all candidate canonical keys
  PERFORM 1 FROM public.work_orders
  WHERE lower(regexp_replace(btrim(wo_number), E'\\s+', '', 'g')) = ANY(v_seen_keys)
  FOR UPDATE;

  -- 5. Process Staged Candidates
  FOR v_ticket, v_norm_wo, v_can_wo IN
    SELECT ticket_data, norm_wo, can_wo FROM _import_stage ORDER BY row_idx ASC
  LOOP
    -- Protection check against 3 legacy soft-deleted WOs
    v_is_protected := (
      v_can_wo IN (
        'wo-express-test-1793825456810',
        'wo-dup-test-1793825458804',
        'wo-dup-test-1793825458804-unique'
      ) OR (v_ticket->>'id') IN (
        'wo_1793825457141_u4bnht',
        'wo_imp_1793825458959_4i4f1h',
        'wo_imp_1793825458959_262dei'
      )
    );

    SELECT id, wo_number INTO v_existing_id, v_existing_wo
    FROM public.work_orders
    WHERE lower(regexp_replace(btrim(wo_number), E'\\s+', '', 'g')) = v_can_wo
    LIMIT 1;

    IF FOUND THEN
      IF v_is_protected THEN
        v_skipped_duplicates := v_skipped_duplicates + 1;
        v_duplicate_existing := array_append(v_duplicate_existing, v_norm_wo);
      ELSIF p_duplicate_policy = 'update_allowed' THEN
        -- Whitelist-only update: appointment_date, slot_time, remarks_agent, customer_phone, ticket_category
        v_app_date := public.morajaws_safe_date(COALESCE(v_ticket->>'appointmentDate', v_ticket->>'appointment_date'));
        v_slot_time := COALESCE(v_ticket->>'slotTime', v_ticket->>'slot_time');
        v_rem_agent := COALESCE(v_ticket->>'remarksAgent', v_ticket->>'remarks_agent');
        v_cust_phone := COALESCE(v_ticket->>'customerPhone', v_ticket->>'customer_phone');
        v_ticket_cat := COALESCE(v_ticket->>'ticketCategory', v_ticket->>'ticket_category');

        UPDATE public.work_orders
        SET
          appointment_date = COALESCE(v_app_date, appointment_date),
          slot_time = COALESCE(v_slot_time, slot_time),
          remarks_agent = COALESCE(v_rem_agent, remarks_agent),
          customer_phone = COALESCE(v_cust_phone, customer_phone),
          ticket_category = COALESCE(v_ticket_cat, ticket_category),
          updated_at = now(),
          updated_by = p_uploaded_by
        WHERE id = v_existing_id;

        v_updated_count := v_updated_count + 1;
      ELSE
        -- skip / review
        v_skipped_duplicates := v_skipped_duplicates + 1;
        v_duplicate_existing := array_append(v_duplicate_existing, v_norm_wo);
      END IF;
    ELSE
      -- Fresh candidate insertion
      IF v_is_protected THEN
        v_skipped_duplicates := v_skipped_duplicates + 1;
        v_duplicate_existing := array_append(v_duplicate_existing, v_norm_wo);
      ELSE
        v_new_id := COALESCE(v_ticket->>'id', 'wo_' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '_' || substr(md5(random()::text), 1, 6));

        INSERT INTO public.work_orders (
          id, wo_number, work_order_number, id_customer, customer_id, ticket_number,
          ticket_date, date, appointment_date, date_upload, file_name, agent_id,
          customer_name, end_user_name, customer_phone, customer_contact1, customer_contact2,
          customer_contact3, customer_phone_normalized, street_name, street_alternatif,
          address, city, postal_code, cluster_name, area,
          appointment_type, slot_time, ticket_category, initial_ticket_category,
          installation_type, service_type, homepass_type, homepass_detail_id,
          olt_code, fdt_code, fat_code, fat_port, dropcore_length, plan,
          service_aging_maintenance, vendor_name, router, ont_brand, ont_model,
          router_brand, router_model, router_serial_number, stb1_sn, stb1_mac,
          stb2_sn, stb2_mac, stb3_sn, stb3_mac, ont_serial_number, ont_mac_address,
          rg_serial_number, rg_mac_address,
          contractor_id, contractor_name, contactor_name, leader_name, corlap_name,
          corlap_contact, installer_name, installer_contact, installer_contact2,
          installer_email, date_assign_agent, date_assign_technician,
          distribution_status, distribution_notes, status_wo_agent, status_wo_installer,
          status_whatsapp, remarks_wo_installer, remarks_agent, remarks,
          chat_messages_count, is_archived, is_deleted,
          unmapped_headers, additional_fields,
          imported_at, import_date, import_batch_id,
          payload, created_at, updated_at, updated_by
        ) VALUES (
          v_new_id,
          v_norm_wo,
          v_norm_wo,
          COALESCE(v_ticket->>'idCustomer', v_ticket->>'id_customer', v_ticket->>'customerId', v_ticket->>'customer_id'),
          COALESCE(v_ticket->>'customerId', v_ticket->>'customer_id', v_ticket->>'idCustomer', v_ticket->>'id_customer'),
          COALESCE(v_ticket->>'ticketNumber', v_ticket->>'ticket_number'),
          public.morajaws_safe_date(COALESCE(v_ticket->>'ticketDate', v_ticket->>'ticket_date')),
          public.morajaws_safe_date(COALESCE(v_ticket->>'date', v_ticket->>'date')),
          public.morajaws_safe_date(COALESCE(v_ticket->>'appointmentDate', v_ticket->>'appointment_date')),
          COALESCE(v_ticket->>'dateUpload', v_ticket->>'date_upload'),
          p_filename,
          COALESCE(v_ticket->>'agentId', v_ticket->>'agent_id'),
          COALESCE(v_ticket->>'customerName', v_ticket->>'customer_name', v_ticket->>'endUserName', v_ticket->>'end_user_name'),
          COALESCE(v_ticket->>'endUserName', v_ticket->>'end_user_name', v_ticket->>'customerName', v_ticket->>'customer_name'),
          COALESCE(v_ticket->>'customerPhone', v_ticket->>'customer_phone'),
          COALESCE(v_ticket->>'customerContact1', v_ticket->>'customer_contact1', v_ticket->>'customerPhone', v_ticket->>'customer_phone'),
          COALESCE(v_ticket->>'customerContact2', v_ticket->>'customer_contact2'),
          COALESCE(v_ticket->>'customerContact3', v_ticket->>'customer_contact3'),
          COALESCE(v_ticket->>'customerPhoneNormalized', v_ticket->>'customer_phone_normalized'),
          COALESCE(v_ticket->>'streetName', v_ticket->>'street_name'),
          COALESCE(v_ticket->>'streetAlternatif', v_ticket->>'street_alternatif'),
          COALESCE(v_ticket->>'address', v_ticket->>'streetName', v_ticket->>'street_name'),
          COALESCE(v_ticket->>'city', v_ticket->>'city'),
          COALESCE(v_ticket->>'postalCode', v_ticket->>'postal_code'),
          COALESCE(v_ticket->>'clusterName', v_ticket->>'cluster_name'),
          COALESCE(v_ticket->>'area', v_ticket->>'area'),
          COALESCE(v_ticket->>'appointmentType', v_ticket->>'appointment_type'),
          COALESCE(v_ticket->>'slotTime', v_ticket->>'slot_time'),
          COALESCE(v_ticket->>'ticketCategory', v_ticket->>'ticket_category'),
          COALESCE(v_ticket->>'initialTicketCategory', v_ticket->>'initial_ticket_category'),
          COALESCE(v_ticket->>'installationType', v_ticket->>'installation_type'),
          COALESCE(v_ticket->>'serviceType', v_ticket->>'service_type'),
          COALESCE(v_ticket->>'homepassType', v_ticket->>'homepass_type'),
          COALESCE(v_ticket->>'homepassDetailId', v_ticket->>'homepass_detail_id'),
          COALESCE(v_ticket->>'oltCode', v_ticket->>'olt_code'),
          COALESCE(v_ticket->>'fdtCode', v_ticket->>'fdt_code'),
          COALESCE(v_ticket->>'fatCode', v_ticket->>'fat_code'),
          COALESCE(v_ticket->>'fatPort', v_ticket->>'fat_port'),
          COALESCE(v_ticket->>'dropcoreLength', v_ticket->>'dropcore_length'),
          COALESCE(v_ticket->>'plan', v_ticket->>'plan'),
          COALESCE(v_ticket->>'serviceAgingMaintenance', v_ticket->>'service_aging_maintenance'),
          COALESCE(v_ticket->>'vendorName', v_ticket->>'vendor_name'),
          COALESCE(v_ticket->>'router', v_ticket->>'router'),
          COALESCE(v_ticket->>'ontBrand', v_ticket->>'ont_brand'),
          COALESCE(v_ticket->>'ontModel', v_ticket->>'ont_model'),
          COALESCE(v_ticket->>'routerBrand', v_ticket->>'router_brand'),
          COALESCE(v_ticket->>'routerModel', v_ticket->>'router_model'),
          COALESCE(v_ticket->>'routerSerialNumber', v_ticket->>'router_serial_number'),
          COALESCE(v_ticket->>'stb1Sn', v_ticket->>'stb1_sn'),
          COALESCE(v_ticket->>'stb1Mac', v_ticket->>'stb1_mac'),
          COALESCE(v_ticket->>'stb2Sn', v_ticket->>'stb2_sn'),
          COALESCE(v_ticket->>'stb2Mac', v_ticket->>'stb2_mac'),
          COALESCE(v_ticket->>'stb3Sn', v_ticket->>'stb3_sn'),
          COALESCE(v_ticket->>'stb3Mac', v_ticket->>'stb3_mac'),
          COALESCE(v_ticket->>'ontSerialNumber', v_ticket->>'ont_serial_number'),
          COALESCE(v_ticket->>'ontMacAddress', v_ticket->>'ont_mac_address'),
          COALESCE(v_ticket->>'rgSerialNumber', v_ticket->>'rg_serial_number'),
          COALESCE(v_ticket->>'rgMacAddress', v_ticket->>'rg_mac_address'),
          COALESCE(v_ticket->>'contractorId', v_ticket->>'contractor_id'),
          COALESCE(v_ticket->>'contractorName', v_ticket->>'contractor_name', v_ticket->>'contactorName', v_ticket->>'contactor_name'),
          COALESCE(v_ticket->>'contactorName', v_ticket->>'contactor_name', v_ticket->>'contractorName', v_ticket->>'contractor_name'),
          COALESCE(v_ticket->>'leaderName', v_ticket->>'leader_name'),
          COALESCE(v_ticket->>'corlapName', v_ticket->>'corlap_name'),
          COALESCE(v_ticket->>'corlapContact', v_ticket->>'corlap_contact'),
          COALESCE(v_ticket->>'installerName', v_ticket->>'installer_name'),
          COALESCE(v_ticket->>'installerContact', v_ticket->>'installer_contact'),
          COALESCE(v_ticket->>'installerContact2', v_ticket->>'installer_contact2'),
          COALESCE(v_ticket->>'installerEmail', v_ticket->>'installer_email'),
          COALESCE(public.morajaws_safe_date(v_ticket->>'dateAssignAgent')::timestamptz, NULL),
          COALESCE(public.morajaws_safe_date(v_ticket->>'dateAssignTechnician')::timestamptz, NULL),
          COALESCE(v_ticket->>'distributionStatus', v_ticket->>'distribution_status', 'pending'),
          COALESCE(v_ticket->>'distributionNotes', v_ticket->>'distribution_notes'),
          COALESCE(v_ticket->>'statusWOAgent', v_ticket->>'status_wo_agent', 'Pending'),
          COALESCE(v_ticket->>'statusWOInstaller', v_ticket->>'status_wo_installer', 'Unassigned'),
          COALESCE(v_ticket->>'statusWhatsApp', v_ticket->>'status_whatsapp', 'not_prepared'),
          COALESCE(v_ticket->>'remarksWOInstaller', v_ticket->>'remarks_wo_installer'),
          COALESCE(v_ticket->>'remarksAgent', v_ticket->>'remarks_agent'),
          COALESCE(v_ticket->>'remarks', v_ticket->>'remarks'),
          0, false, false,
          COALESCE(v_ticket->'unmappedHeaders', v_ticket->'unmapped_headers', '[]'::jsonb),
          COALESCE(v_ticket->'additionalFields', v_ticket->'additional_fields', '{}'::jsonb),
          now(), CURRENT_DATE, p_import_id,
          COALESCE(v_ticket->'payload', '{}'::jsonb),
          now(), now(), p_uploaded_by
        );

        v_inserted_count := v_inserted_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- 6. Evaluate Final Batch Status
  IF (v_inserted_count > 0 OR v_updated_count > 0) AND (v_invalid_count > 0 OR v_failed_count > 0) THEN
    v_final_status := 'PARTIAL_SUCCESS';
  ELSIF (v_inserted_count > 0 OR v_updated_count > 0) AND (v_invalid_count = 0 AND v_failed_count = 0) THEN
    v_final_status := 'SUCCESS';
  ELSIF v_skipped_duplicates > 0 AND v_invalid_count = 0 AND v_failed_count = 0 THEN
    v_final_status := 'SUCCESS';
  ELSE
    v_final_status := 'FAILED';
  END IF;

  -- 7. Finalize work_order_imports tracking within the exact same transaction
  UPDATE public.work_order_imports
  SET
    valid_rows = (v_total_submitted - v_invalid_count),
    invalid_rows = v_invalid_count,
    inserted_rows = v_inserted_count,
    updated_rows = v_updated_count,
    duplicate_rows = v_skipped_duplicates,
    failed_rows = v_failed_count,
    status = v_final_status,
    error_summary = CASE WHEN array_length(v_failed_errors, 1) > 0 THEN array_to_string(v_failed_errors, '; ') ELSE NULL END,
    error_details = v_errors,
    updated_at = now()
  WHERE import_id = p_import_id;

  -- 8. Return Complete Atomic Result
  RETURN jsonb_build_object(
    'success', (v_final_status IN ('SUCCESS', 'PARTIAL_SUCCESS')),
    'status', v_final_status,
    'importId', p_import_id,
    'totalSubmitted', v_total_submitted,
    'imported', v_inserted_count,
    'updatedCount', v_updated_count,
    'skippedDuplicates', v_skipped_duplicates,
    'invalidCount', v_invalid_count,
    'failedCount', v_failed_count,
    'duplicateInFileWoNumbers', to_jsonb(v_duplicate_in_file),
    'duplicateExistingWoNumbers', to_jsonb(v_duplicate_existing),
    'invalidRows', v_invalid_rows,
    'failedErrors', to_jsonb(v_failed_errors),
    'errors', v_errors,
    'isIdempotentReplay', false
  );
END;
$$;

-- 6. Strict RLS and Security Lockdown
REVOKE ALL ON FUNCTION public.morajaws_import_work_orders_atomic(text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morajaws_import_work_orders_atomic(text, text, text, text, text, text, text, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.fn_protect_legacy_soft_deleted_wo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_protect_legacy_soft_deleted_wo() TO service_role;

REVOKE ALL ON FUNCTION public.morajaws_safe_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.morajaws_safe_date(text) TO authenticated, service_role;

COMMIT;
