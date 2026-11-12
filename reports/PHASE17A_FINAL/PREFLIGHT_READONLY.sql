-- ==============================================================================
-- MORAJAWS — PHASE 17A READ-ONLY PREFLIGHT VERIFICATION SCRIPT
-- STRICTLY SELECT-ONLY. ZERO DDL (NO CREATE/ALTER/DROP). ZERO DML (NO INSERT/UPDATE/DELETE).
-- TARGETS: Production (wiahuupjgpadxqiiarzi) and Staging (lvytgqsvxntnvlohmrxi)
-- ==============================================================================

-- 1. VERIFY CORE PUBLIC TABLES EXISTENCE
SELECT 
  table_name, 
  table_type,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'work_orders', 
    'users', 
    'auth_sessions', 
    'roles', 
    'contractors', 
    'coverage_areas', 
    'technical_reports', 
    'audit_logs', 
    'work_order_imports', 
    'app_settings'
  )
ORDER BY table_name;

-- 2. VERIFY WORK_ORDERS TABLE COLUMNS & DATA TYPES
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'work_orders'
ORDER BY ordinal_position;

-- 3. VERIFY CUSTOM AUTH USERS TABLE STRUCTURE (Ensure password_hash & custom fields exist)
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. VERIFY WORK ORDER NORMALIZED UNIQUE INDEX (CRITICAL FOR DEDUPLICATION)
SELECT 
  schemaname, 
  tablename, 
  indexname, 
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'work_orders'
  AND (indexname LIKE '%normalized%' OR indexname LIKE '%wo_number%');

-- 5. VERIFY FOREIGN KEYS ON PUBLIC TABLES (Ensure no references to auth.users)
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 6. VERIFY ROW LEVEL SECURITY (RLS) STATUS ON ALL PUBLIC TABLES
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 7. VERIFY POLICIES APPLIED ON PUBLIC TABLES (Checking service_role / anon lockdown)
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 8. VERIFY ATOMIC STORED PROCEDURES & FUNCTIONS (RPC)
SELECT 
  routine_name, 
  routine_type, 
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'fn_create_auth_session_atomic',
    'fn_rotate_refresh_token_atomic',
    'fn_revoke_all_user_sessions_atomic',
    'fn_submit_technical_report_atomic',
    'fn_batch_import_work_orders',
    'fn_protect_legacy_soft_deleted_wo'
  )
ORDER BY routine_name;

-- 9. VERIFY TRIGGERS ON WORK_ORDERS (Ensuring protection trigger is active)
SELECT 
  event_object_table AS table_name, 
  trigger_name, 
  event_manipulation, 
  action_statement, 
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'work_orders'
ORDER BY trigger_name;

-- 10. VERIFY IMMUTABILITY & EXISTENCE OF 3 PROTECTED SOFT-DELETED WORK ORDERS
SELECT 
  id, 
  wo_number, 
  status, 
  is_deleted, 
  deleted_at, 
  created_at
FROM public.work_orders
WHERE id IN (
  'wo_1793825457141_u4bnht',
  'wo_imp_1793825458959_4i4f1h',
  'wo_imp_1793825458959_262dei'
);

-- 11. CHECK RECORD COUNTS (READ-ONLY)
SELECT 'work_orders' AS entity, count(*) AS total_count FROM public.work_orders
UNION ALL
SELECT 'users' AS entity, count(*) AS total_count FROM public.users
UNION ALL
SELECT 'auth_sessions' AS entity, count(*) AS total_count FROM public.auth_sessions
UNION ALL
SELECT 'contractors' AS entity, count(*) AS total_count FROM public.contractors
UNION ALL
SELECT 'coverage_areas' AS entity, count(*) AS total_count FROM public.coverage_areas
UNION ALL
SELECT 'technical_reports' AS entity, count(*) AS total_count FROM public.technical_reports;

-- ==============================================================================
-- END OF READ-ONLY PREFLIGHT AUDIT SCRIPT
-- ==============================================================================
