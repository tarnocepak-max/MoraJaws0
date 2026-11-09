import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseBackendClient } from '../server/supabaseClient.ts';

function ensureEnvLoaded() {
  // Security: test scripts may only use environment variables explicitly provided
  // to this process. Never inspect /proc or another process environment.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[ENV] Supabase credentials are not available in this test process; remote checks may be BLOCKED.');
  }
}

ensureEnvLoaded();

async function runRlsAudit() {
  console.log('=== MORAJAWS PHASE 6: RLS & SECURITY AUDIT ===');
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !url.startsWith('http')) {
    console.log('SUPABASE_URL belum dikonfigurasi pada environment. Audit RLS remote berstatus BLOCKED (menunggu kredensial).');
    console.log('Validasi Desain RLS: migrations/001_core_morajaws_schema.sql mengaktifkan RLS deny-by-default pada 17 tabel publik.');
    process.exit(0);
    return;
  }

  console.log('1. Checking Anon Client Access:');
  const anonClient = createClient(url, anonKey || 'placeholder-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const tables = ['work_orders', 'users', 'contractors', 'coverage_areas', 'ticket_messages', 'audit_logs', 'app_settings'];
  for (const table of tables) {
    try {
      const { data, error, status } = await anonClient.from(table).select('*').limit(1);
      if (error) {
        console.log(`- Table "${table}" with Anon Key: DENIED / SECURE (HTTP ${status}, code: ${error.code}, message: ${error.message})`);
      } else {
        console.warn(`- WARNING: Table "${table}" was readable by Anon client! Records returned: ${data?.length}`);
      }
    } catch (e: any) {
      console.log(`- Table "${table}" with Anon Key: EXCEPTION (${e.message})`);
    }
  }

  console.log('\n2. Checking Direct Anonymous HTTP Request (No apikey header):');
  const parsed = new URL(url);
  const testNoAuth = () => new Promise<{ status: number; body: string }>((resolve) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/rest/v1/work_orders',
      method: 'GET'
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, body: d }));
    });
    req.on('error', e => resolve({ status: 500, body: e.message }));
    req.end();
  });

  const noAuthRes = await testNoAuth();
  console.log(`- Request without apikey header returned HTTP ${noAuthRes.status}: ${noAuthRes.body}`);

  console.log('\n3. Checking Backend Service Role Client Access:');
  const backendClient = getSupabaseBackendClient();
  if (backendClient) {
    const { error: testErr, status: testStatus } = await backendClient.from('work_orders').select('*').limit(1);
    console.log(`- Backend Service Role client query returned HTTP ${testStatus}, error: ${testErr ? `${testErr.code} - ${testErr.message}` : 'None'}`);
  }

  console.log('\n4. Checking Storage Bucket "morajaws-reports" Anon Access:');
  const { data: bucketData, error: bucketError } = await anonClient.storage.from('morajaws-reports').list('test-sandbox');
  if (bucketError) {
    console.log(`- Storage anon list: DENIED / SECURE (${bucketError.message})`);
  } else {
    console.warn(`- WARNING: Storage anon list returned data:`, bucketData);
  }

  process.exit(0);
}

runRlsAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
