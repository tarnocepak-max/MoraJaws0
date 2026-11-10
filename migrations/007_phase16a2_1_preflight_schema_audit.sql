-- =============================================================================
-- MORAJAWS PREFLIGHT SCHEMA AUDIT (PHASE 16A.2.1 READ-ONLY)
-- Target Database: Supabase PostgreSQL (Staging: lvytgqsvxntnvlohmrxi)
--
-- PURPOSE:
--   Comprehensive, 100% read-only preflight audit of all 19 MoraJaws tables.
--   Audits existence, columns, data types, primary keys, foreign keys,
--   unique constraints, indexes, triggers, row level security (RLS),
--   policies, and permissions grants (service_role, authenticated, anon).
--
-- SAFETY:
--   - READ-ONLY: ZERO INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, or GRANT.
--   - Safe to run directly in Supabase SQL Editor on Staging or Production.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABEL: VERIFIKASI KEBERADAAN 19 TABEL KANONIKAL
-- -----------------------------------------------------------------------------
WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  ]::text[]) AS table_name
),
actual_tables AS (
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public'
)
SELECT 
  et.table_name,
  CASE WHEN at.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS existence_status,
  t.rowsecurity AS rls_enabled
FROM expected_tables et
LEFT JOIN actual_tables at ON et.table_name = at.table_name
LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = et.table_name
ORDER BY et.table_name;

-- -----------------------------------------------------------------------------
-- 2. KOLOM & TIPE DATA: AUDIT DETAIL SELURUH KOLOM PADA 19 TABEL
-- -----------------------------------------------------------------------------
SELECT 
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- 3. AUDIT KOLOM KRITIS PADA TABEL INTI (users, work_orders, system_error_logs)
-- Memastikan kolom-kolom penting migrasi 007 terdaftar fisik.
-- -----------------------------------------------------------------------------
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  CASE 
    WHEN table_name = 'users' AND column_name IN ('auth_user_id', 'session_version', 'alt_email', 'firebase_uid', 'is_deleted') THEN 'CRITICAL_AUTH_COLUMN'
    WHEN table_name = 'work_orders' AND column_name IN ('installer_id', 'appointment_date', 'work_sessions', 'chat_messages_count', 'is_deleted') THEN 'CRITICAL_WO_COLUMN'
    WHEN table_name = 'system_error_logs' AND column_name IN ('source', 'endpoint', 'http_method', 'username', 'is_resolved') THEN 'CRITICAL_LOG_COLUMN'
    ELSE 'STANDARD_COLUMN'
  END AS importance
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'users' AND column_name IN ('auth_user_id', 'session_version', 'alt_email', 'firebase_uid', 'is_deleted', 'role'))
    OR (table_name = 'work_orders' AND column_name IN ('installer_id', 'appointment_date', 'work_sessions', 'chat_messages_count', 'is_deleted', 'status_wo_agent'))
    OR (table_name = 'system_error_logs' AND column_name IN ('source', 'endpoint', 'http_method', 'username', 'is_resolved', 'error_code'))
  )
ORDER BY table_name, column_name;

-- -----------------------------------------------------------------------------
-- 4. PRIMARY KEY, FOREIGN KEY, DAN UNIQUE CONSTRAINTS
-- -----------------------------------------------------------------------------
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu 
  ON ccu.constraint_name = tc.constraint_name 
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- -----------------------------------------------------------------------------
-- 5. INDEXES AUDIT (TERMASUK UNIQUE PARTIAL INDEX PADA auth_user_id)
-- -----------------------------------------------------------------------------
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY tablename, indexname;

-- -----------------------------------------------------------------------------
-- 6. TRIGGERS AUDIT (TERMASUK PROTEKSI 3 WO DAN IMMUTABILITAS AUDIT LOGS)
-- -----------------------------------------------------------------------------
SELECT 
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY event_object_table, trigger_name;

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES AUDIT
-- Memastikan policy service_role aktif dan tidak ada policy liar untuk anon/authenticated.
-- -----------------------------------------------------------------------------
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- 8. DATABASE GRANTS AUDIT (service_role, authenticated, anon)
-- Memastikan authenticated dan anon tidak memiliki akses langsung yang tidak diperlukan.
-- -----------------------------------------------------------------------------
SELECT 
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('service_role', 'authenticated', 'anon')
  AND table_name IN (
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  )
ORDER BY table_name, grantee, privilege_type;

-- -----------------------------------------------------------------------------
-- 9. VERIFIKASI KEBERADAAN 3 WORK ORDER SOFT-DELETED YANG DILINDUNGI MUTLAK
-- -----------------------------------------------------------------------------
SELECT 
  id,
  wo_number,
  status_wo_agent,
  is_deleted,
  deleted_at,
  'PROTECTED_RECORD_EXISTS' AS protection_audit_status
FROM public.work_orders
WHERE id IN (
  'wo_1793825457141_u4bnht',
  'wo_imp_1793825458959_4i4f1h',
  'wo_imp_1793825458959_262dei'
) OR wo_number IN (
  'WO-EXPRESS-TEST-1793825456810',
  'WO-DUP-TEST-1793825458804',
  'WO-DUP-TEST-1793825458804-UNIQUE'
);
