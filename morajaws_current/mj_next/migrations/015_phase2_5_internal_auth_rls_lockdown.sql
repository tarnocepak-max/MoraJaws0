-- MoraJaws Phase 2.5
-- Internal authentication is authoritative; the browser never authenticates through Supabase Auth.
-- The Express backend uses the server-side Supabase service role for database access.
-- Therefore anonymous/authenticated PostgREST roles must not receive direct data access.
-- This removes dependence on auth.uid() policies from the application's production access path.

BEGIN;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'roles','contractors','coverage_areas','users','work_orders','assignment_history',
    'ticket_messages','technical_reports','wa_templates','app_settings','user_preferences',
    'session_config','user_sessions','attachments','audit_logs','integration_configs',
    'sync_history','system_error_logs','report_categories','auth_sessions','refresh_tokens',
    'login_attempts'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', tbl);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
    END IF;
  END LOOP;
END $$;

-- Prevent direct invocation of administrative SECURITY DEFINER helpers by browser roles.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'get_auth_user_role',
        'morajaws_set_updated_at',
        'morajaws_reject_audit_mutation',
        'fn_protect_legacy_soft_deleted_wo'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.signature);
  END LOOP;
END $$;

COMMIT;
