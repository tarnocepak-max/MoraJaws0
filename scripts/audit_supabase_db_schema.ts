import { getSupabaseBackendClient, checkSupabaseConnection } from '../server/supabaseClient.ts';

import 'dotenv/config';

async function run() {
  const health = await checkSupabaseConnection();
  console.log('Health check:', JSON.stringify(health));

  const client = getSupabaseBackendClient();
  if (!client) {
    console.error('Failed to get Supabase client');
    process.exit(1);
  }

  const tablesToCheck = [
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
    'system_error_logs'
  ];

  const results: Record<string, { exists: boolean; count?: number; error?: string; sampleCols?: string[] }> = {};

  for (const table of tablesToCheck) {
    try {
      const { data, error, count } = await client
        .from(table)
        .select('*', { count: 'exact', head: false })
        .limit(1);

      if (error) {
        results[table] = { exists: false, error: `${error.code}: ${error.message}` };
      } else {
        results[table] = {
          exists: true,
          count: count ?? 0,
          sampleCols: data && data.length > 0 ? Object.keys(data[0]) : []
        };
      }
    } catch (err: any) {
      results[table] = { exists: false, error: err.message };
    }
  }

  console.log('Table existence and counts:');
  for (const [t, info] of Object.entries(results)) {
    console.log(`- ${t}: exists=${info.exists}, count=${info.count ?? 'N/A'}, err=${info.error || 'none'}`);
  }
}

run().catch(console.error);
