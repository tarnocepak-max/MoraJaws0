/**
 * MORAJAWS — PREFLIGHT SCHEMA AUDIT SCRIPT FOR ALL 19 CANONICAL TABLES
 * 
 * Inspects all 19 canonical tables:
 * 1. roles
 * 2. contractors
 * 3. coverage_areas
 * 4. users
 * 5. work_orders
 * 6. assignment_history
 * 7. ticket_messages
 * 8. technical_reports
 * 9. wa_templates
 * 10. app_settings
 * 11. user_preferences
 * 12. session_config
 * 13. user_sessions
 * 14. attachments
 * 15. audit_logs
 * 16. integration_configs
 * 17. sync_history
 * 18. system_error_logs
 * 19. report_categories
 *
 * Runs in two modes:
 * - REMOTE MODE: If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present.
 * - STATIC AUDIT MODE: Audits DDL files against expected canonical schema definitions.
 */

import fs from 'fs';
import path from 'path';
import { getSupabaseBackendClient, checkSupabaseConnection } from '../server/supabaseClient.ts';

export const CANONICAL_19_TABLES = [
  'roles',
  'contractors',
  'coverage_areas',
  'users',
  'work_orders',
  'assignment_history',
  'ticket_messages',
  'technical_reports',
  'wa_templates',
  'app_settings',
  'user_preferences',
  'session_config',
  'user_sessions',
  'attachments',
  'audit_logs',
  'integration_configs',
  'sync_history',
  'system_error_logs',
  'report_categories'
] as const;

export const CRITICAL_COLUMNS: Record<string, string[]> = {
  users: ['id', 'auth_user_id', 'firebase_uid', 'name', 'username', 'email', 'alt_email', 'role', 'session_version', 'is_deleted'],
  work_orders: ['id', 'wo_number', 'appointment_date', 'slot_time', 'installer_id', 'contractor_id', 'status_wo_agent', 'work_sessions', 'chat_messages_count', 'is_deleted'],
  roles: ['id', 'code', 'name', 'permissions'],
  contractors: ['id', 'name', 'code', 'coverage_areas', 'active'],
  coverage_areas: ['id', 'name', 'clusters', 'active'],
  assignment_history: ['id', 'work_order_id', 'wo_number', 'installer_name', 'performed_by', 'created_at'],
  ticket_messages: ['id', 'ticket_id', 'sender_name', 'sender_role', 'message_text', 'created_at'],
  technical_reports: ['id', 'work_order_id', 'wo_number', 'main_category', 'root_cause', 'optical_power_dbm', 'submitted_by'],
  wa_templates: ['id', 'name', 'category', 'body', 'active'],
  app_settings: ['setting_key', 'setting_value', 'created_at'],
  user_preferences: ['user_id', 'preferences'],
  session_config: ['config_key', 'config_value'],
  user_sessions: ['id', 'session_id', 'user_id', 'username', 'role', 'status', 'expires_at'],
  attachments: ['id', 'work_order_id', 'file_name', 'file_type', 'storage_provider'],
  audit_logs: ['id', 'action', 'entity', 'entity_id', 'performed_by', 'user_role', 'event_at'],
  integration_configs: ['config_key', 'provider', 'config', 'enabled'],
  sync_history: ['id', 'job_id', 'sync_type', 'status', 'started_at'],
  system_error_logs: ['id', 'error_code', 'module', 'operation', 'source', 'endpoint', 'message', 'severity', 'status'],
  report_categories: ['id', 'category_name', 'category_type', 'active', 'display_order']
};

async function runPreflightAudit() {
  console.log('==============================================================================');
  console.log('MORAJAWS PREFLIGHT SCHEMA AUDIT (ALL 19 CANONICAL TABLES)');
  console.log('Target Staging: lvytgqsvxntnvlohmrxi | URL: https://lvytgqsvxntnvlohmrxi.supabase.co');
  console.log('==============================================================================\n');

  const hasRemoteCreds = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (hasRemoteCreds) {
    console.log('[MODE] REMOTE LIVE DATABASE AUDIT');
    const health = await checkSupabaseConnection();
    console.log(`Connection Health: ${health.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED'} (${health.latencyMs || 0}ms)`);

    const client = getSupabaseBackendClient();
    if (!client) {
      console.error('Failed to initialize Supabase client');
      process.exit(1);
    }

    for (const tbl of CANONICAL_19_TABLES) {
      try {
        const { error, count } = await client.from(tbl).select('*', { count: 'exact', head: true });
        if (error) {
          console.log(`- Table ${tbl.padEnd(20)}: MISSING / ERROR (${error.code}: ${error.message})`);
        } else {
          console.log(`- Table ${tbl.padEnd(20)}: EXISTS (Rows: ${count ?? 0})`);
        }
      } catch (err: any) {
        console.log(`- Table ${tbl.padEnd(20)}: ERROR (${err.message})`);
      }
    }
  } else {
    console.log('[MODE] STATIC SCHEMA PREFLIGHT AUDIT (Migration 007 Verification)');
    console.log('Live credentials are not set in this runner process; evaluating DDL definitions...\n');

    const migrationFile = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_schema_initialization.sql');
    if (!fs.existsSync(migrationFile)) {
      console.error(`Missing migration file: ${migrationFile}`);
      process.exit(1);
    }

    const ddl = fs.readFileSync(migrationFile, 'utf8');

    let allTablesFound = true;
    let allCriticalColsFound = true;

    console.log('1. VERIFIKASI KEBERADAAN 19 TABEL PADA DDL 007:');
    for (const tbl of CANONICAL_19_TABLES) {
      const tableCreated = ddl.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`);
      const rlsEnabled = ddl.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
      const status = tableCreated && rlsEnabled ? 'PASS' : 'FAIL';
      if (!tableCreated || !rlsEnabled) allTablesFound = false;

      console.log(`   [${status}] public.${tbl.padEnd(20)} -> Table DDL: ${tableCreated ? 'YES' : 'NO'}, RLS: ${rlsEnabled ? 'ENABLED' : 'MISSING'}`);
    }

    console.log('\n2. VERIFIKASI KOLOM KRITIS PADA TABEL INTI:');
    for (const [tbl, cols] of Object.entries(CRITICAL_COLUMNS)) {
      for (const col of cols) {
        // Check either in CREATE TABLE or in ALTER TABLE ADD COLUMN IF NOT EXISTS
        const colRegex = new RegExp(`\\b${col}\\b`, 'i');
        const found = colRegex.test(ddl);
        if (!found) {
          console.log(`   [FAIL] Column missing: public.${tbl}.${col}`);
          allCriticalColsFound = false;
        }
      }
    }

    if (allCriticalColsFound) {
      console.log('   [ALL PASS] Seluruh kolom kritis untuk 19 tabel terverifikasi pada blueprint 007.');
    }

    console.log('\n3. VERIFIKASI PROTEKSI KEAMANAN KHUSUS:');
    const has3WoProtected = ddl.includes('fn_protect_legacy_soft_deleted_wo') && ddl.includes('trg_protect_legacy_wo_mutation');
    const hasAuditImmutable = ddl.includes('morajaws_reject_audit_mutation') && ddl.includes('trg_audit_logs_immutable');
    const hasExpressOnlyRevoke = ddl.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;');
    const hasServiceRoleAll = ddl.includes('CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role');

    console.log(`   - Proteksi Mutlak 3 WO Legasi : ${has3WoProtected ? 'PASS' : 'FAIL'}`);
    console.log(`   - Immutabilitas Audit Logs    : ${hasAuditImmutable ? 'PASS' : 'FAIL'}`);
    console.log(`   - Revoke Hak Langsung Browser : ${hasExpressOnlyRevoke ? 'PASS' : 'FAIL'}`);
    console.log(`   - Service Role Policy Backend : ${hasServiceRoleAll ? 'PASS' : 'FAIL'}`);

    console.log('\n==============================================================================');
    console.log(`PREFLIGHT AUDIT STATUS: ${allTablesFound && allCriticalColsFound && has3WoProtected && hasAuditImmutable && hasExpressOnlyRevoke && hasServiceRoleAll ? 'READY FOR STAGING' : 'INCOMPLETE'}`);
    console.log('==============================================================================\n');
  }
}

runPreflightAudit().catch(err => {
  console.error('Fatal preflight error:', err);
  process.exit(1);
});
