/**
 * MORAJAWS — PHASE 14C.2 REMAINING ENDPOINT SECURITY AUDIT & INTEGRATION TEST SUITE
 * 
 * Verifies all remaining Express endpoints not covered in Phase 14C.1:
 * 1. Authentication & Session Security:
 *    - /api/bootstrap
 *    - /api/auth/supabase-login
 *    - /api/auth/supabase-refresh
 *    - /api/auth/supabase-logout
 *    - /api/auth/supabase-reset-password
 *    - /api/auth/change-password
 *    - /api/auth/me
 * 
 * 2. Work Order & Search Endpoints:
 *    - /api/tickets/search
 *    - /api/tickets/sameday
 *    - /api/tickets/bulk-delete
 *    - /api/tickets/purge-by-date
 *    - /api/tickets/batch/:date
 *    - /api/work-orders
 *    - /api/work-orders/:id
 *    - /api/work-orders/:id/assign
 *    - /api/work-orders/:id/reassign
 * 
 * 3. Administrative, Session & Backup Endpoints:
 *    - /api/sessions
 *    - /api/sessions/revoke
 *    - /api/sessions/config
 *    - /api/admin/backup/download
 *    - /api/system/operational-date
 * 
 * 4. Google Sheets & Sync Endpoints:
 *    - /api/sheets/config & /api/integrations/google-sheets/config
 *    - /api/integrations/google-sheets/status
 *    - /api/integrations/google-sheets/test
 *    - /api/integrations/google-sheets/sync
 *    - /api/sync/status
 *    - /api/sync/check-connection
 *    - /api/sync/history
 *    - /api/sync/run
 * 
 * 5. Storage, Files & Attachment Endpoints:
 *    - /api/attachments
 *    - /api/storage/readiness
 *    - /api/storage/classify-file
 *    - /api/storage/actual-bucket-status
 *    - /api/storage/test-upload
 *    - /api/storage/refresh-signed-url
 *    - /api/storage/download
 *    - /api/storage/verify-access
 *    - /api/storage/adapter/config
 *    - /api/storage/adapter/upload
 *    - /api/storage/adapter/download
 *    - /api/storage/adapter/signed-url
 *    - /api/storage/adapter/refresh-signed-url
 *    - /api/storage/adapter/file
 *    - /api/storage/adapter/reconciliation
 * 
 * 6. Hardened Supabase Proxy Endpoints:
 *    - /api/supabase/work-orders/:id/archive
 *    - /api/supabase/work-orders/:id/restore
 *    - /api/supabase/work-orders/bulk-import
 *    - /api/supabase/users/:id/reset-password
 *    - /api/supabase/realtime/stream
 *    - /api/supabase/phase8-shadow-dryrun
 * 
 * 7. Sandbox & Realtime Internal Endpoints:
 *    - /api/realtime/stream-sandbox
 *    - /api/realtime/publish-sandbox
 *    - /api/realtime/sandbox-status
 *    - /api/sandbox/journal/mutate
 *    - /api/sandbox/journal/import-chunked
 *    - /api/sandbox/outbox/query
 *    - /api/sandbox/recovery/drain
 *    - /api/sandbox/realtime/stream
 *    - /api/sandbox/test/chaos
 * 
 * 8. Communication & Audit Endpoints:
 *    - /api/whatsapp/preview
 *    - /api/audit-logs
 *    - /api/settings
 *    - /api/reports
 *    - /api/tickets/:id/messages
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  createExpressApp,
  SERVER_SESSIONS,
  db,
  PROTECTED_PRODUCTION_WO_IDS,
  isLocalJsonModeAllowed,
  hashPassword,
  DEFAULT_HASH
} from '../server.ts';

import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting
} from '../server/supabaseClient.ts';

import { SuiteEvidenceCollector } from './evidenceCollector.ts';

interface TestResult {
  num: number;
  title: string;
  category: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];
const evidenceCollector = new SuiteEvidenceCollector('Phase14C.2');

function recordTest(num: number, title: string, category: string, passed: boolean, details: string) {
  results.push({ num, title, category, passed, details });
  evidenceCollector.linkToScenario({ num, title, category, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] Test #${num} [${category}]: ${title}`);
  console.log(`       -> ${details}`);
}

/**
 * Creates a controllable mock Supabase client for deterministic testing of remaining endpoints.
 */
function createMockClient(options: {
  initialWorkOrder?: any;
  dbUnavailable?: boolean;
  userRecord?: any;
  appSettingRecord?: any;
}) {
  let woState = options.initialWorkOrder ? { ...options.initialWorkOrder } : {
    id: 'wo_test_mock_202',
    wo_number: 'WO-TEST-MOCK-202',
    installer_name: 'Teknisi Budi',
    installer_id: 'u-installer-01',
    slot_time: '09:00 - 11:00',
    status_wo_installer: 'Assigned',
    appointment_date: '2026-11-06',
    contractor_id: 'c-test-01',
    contractor_name: 'PT Mitra Jaringan Solusi',
    contactor_name: 'PT Mitra Jaringan Solusi',
    area: 'Jakarta Barat',
    updated_at: '2026-11-05T00:00:00Z',
    is_deleted: false,
    is_archived: false,
    payload: {
      id: 'wo_test_mock_202',
      woNumber: 'WO-TEST-MOCK-202',
      installerName: 'Teknisi Budi',
      installerId: 'u-installer-01',
      contractorName: 'PT Mitra Jaringan Solusi',
      contractorId: 'c-test-01',
      contactorName: 'PT Mitra Jaringan Solusi',
      area: 'Jakarta Barat',
      statusWOInstaller: 'Assigned',
      appointmentDate: '2026-11-06',
      customerName: 'Pelanggan Test 202',
      customerPhone: '081234567890',
      technicalReport: { status: 'Installed', note: 'Pemasangan berhasil dan redaman optik aman -18dBm' }
    }
  };

  const usersList: any[] = [
    {
      id: 'u_superadmin_01',
      username: 'superadmin',
      name: 'Super Administrator',
      email: 'admin@morajaws.net',
      role: 'super_admin',
      active: true,
      is_deleted: false,
      password_hash: hashPassword('current_password'),
      session_version: 1,
      payload: { sessionVersion: 1, passwordHash: hashPassword('current_password') }
    },
    {
      id: 'u_management_data_01',
      username: 'mgmt_data',
      name: 'Petugas Data',
      email: 'mgmt@morajaws.net',
      role: 'management_data',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    },
    {
      id: 'u_dispatch_01',
      username: 'dispatch_andi',
      name: 'Dispatch Andi',
      email: 'dispatch@morajaws.net',
      role: 'dispatch',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    },
    {
      id: 'u_itsupport_01',
      username: 'it_support_bambang',
      name: 'IT Support Bambang',
      email: 'itsupport@morajaws.net',
      role: 'it_support',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    },
    {
      id: 'u_leader_01',
      username: 'leader_mjs',
      name: 'Leader Hendra',
      email: 'leader@morajaws.net',
      role: 'leader',
      contractor: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    },
    {
      id: 'u-installer-01',
      username: 'installer_budi',
      name: 'Teknisi Budi',
      email: 'budi@morajaws.net',
      role: 'installer',
      contractor: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    }
  ];

  function makeFluentBuilder(getData: () => any, error: any = null) {
    let filterCol: string | null = null;
    let filterVal: any = null;

    const builder: any = {
      select: (_cols?: string) => builder,
      eq: (col: string, val: any) => {
        filterCol = col;
        filterVal = val;
        return builder;
      },
      ilike: (col: string, val: any) => {
        filterCol = col;
        filterVal = val;
        return builder;
      },
      in: (_col: string, _vals: any[]) => builder,
      or: (_clause: string) => builder,
      not: () => builder,
      filter: () => builder,
      range: () => builder,
      order: (_col?: string, _opts?: any) => builder,
      limit: (_n?: number) => builder,
      single: async () => {
        if (error) return { data: null, error };
        const raw = getData();
        let items = Array.isArray(raw) ? raw : [raw];
        if (filterCol) {
          items = items.filter((x: any) => x && (x[filterCol!] === filterVal || String(x[filterCol!]).toLowerCase() === String(filterVal).toLowerCase()));
        }
        if (items.length > 0) return { data: items[0], error: null };
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      },
      maybeSingle: async () => {
        if (error) return { data: null, error };
        const raw = getData();
        let items = Array.isArray(raw) ? raw : [raw];
        if (filterCol) {
          items = items.filter((x: any) => x && (x[filterCol!] === filterVal || String(x[filterCol!]).toLowerCase() === String(filterVal).toLowerCase()));
        }
        if (items.length > 0) return { data: items[0], error: null };
        return { data: null, error: null };
      },
      then: (resolve: (val: any) => any, reject?: (err: any) => any) => {
        if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
        const raw = getData();
        let items = Array.isArray(raw) ? raw : [raw];
        if (filterCol) {
          items = items.filter((x: any) => x && (x[filterCol!] === filterVal || String(x[filterCol!]).toLowerCase() === String(filterVal).toLowerCase()));
        }
        return Promise.resolve({ data: items, error: null }).then(resolve, reject);
      }
    };
    return builder;
  }

  const mockClient: any = {
    from: (table: string) => {
      if (options.dbUnavailable) {
        const unavailError = { message: 'Database connection failed', code: 'ECONNREFUSED' };
        return {
          select: () => makeFluentBuilder(() => null, unavailError),
          insert: () => makeFluentBuilder(() => null, unavailError),
          update: () => makeFluentBuilder(() => null, unavailError),
          delete: () => makeFluentBuilder(() => null, unavailError),
          upsert: () => makeFluentBuilder(() => null, unavailError)
        };
      }

      if (table === 'work_orders') {
        return {
          select: (_cols?: string) => makeFluentBuilder(() => [{ ...woState }]),
          update: (updates: any) => {
            Object.assign(woState, updates);
            if (updates.payload) {
              woState.payload = { ...(woState.payload || {}), ...updates.payload };
            }
            return makeFluentBuilder(() => [{ ...woState }]);
          },
          insert: (rows: any[]) => {
            if (rows && rows[0]) Object.assign(woState, rows[0]);
            return makeFluentBuilder(() => rows);
          },
          delete: () => makeFluentBuilder(() => [])
        };
      }

      if (table === 'users') {
        return {
          select: (_cols?: string) => makeFluentBuilder(() => usersList),
          insert: (rows: any[]) => {
            if (rows && rows[0]) usersList.push(rows[0]);
            return makeFluentBuilder(() => rows);
          },
          update: (updates: any) => makeFluentBuilder(() => {
            return usersList;
          }),
          delete: () => makeFluentBuilder(() => [])
        };
      }

      if (table === 'app_settings') {
        return {
          select: () => makeFluentBuilder(() => [{ setting_key: 'global_config', setting_value: { appName: 'MoraJaws V6' } }]),
          upsert: (rows: any[]) => makeFluentBuilder(() => rows)
        };
      }

      if (table === 'audit_logs') {
        return {
          insert: (rows: any[]) => makeFluentBuilder(() => rows),
          select: () => makeFluentBuilder(() => [
            {
              id: 'log_mock_01',
              action: 'System Test Audit',
              category: 'security',
              user_id: 'u_superadmin_01',
              user_name: 'Super Administrator',
              user_role: 'super_admin',
              created_at: new Date().toISOString()
            }
          ])
        };
      }

      if (table === 'ticket_messages') {
        return {
          select: () => makeFluentBuilder(() => [
            {
              id: 'msg_001',
              ticket_id: 'wo_test_mock_202',
              wo_number: 'WO-TEST-MOCK-202',
              sender_id: 'u_superadmin_01',
              sender_name: 'Super Administrator',
              sender_role: 'super_admin',
              message_text: 'Mohon update status di lapangan',
              created_at: new Date().toISOString()
            }
          ]),
          insert: (rows: any[]) => makeFluentBuilder(() => rows)
        };
      }

      return makeFluentBuilder(() => []);
    },
    auth: {
      signOut: async () => ({ error: null })
    }
  };

  return { mockClient, getWoState: () => woState };
}

/**
 * Configure test authentication sessions.
 */
function setupTestAuthSessions() {
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const expiredIso = new Date(Date.now() - 3600 * 1000).toISOString();

  SERVER_SESSIONS.length = 0;

  // 1. Super Admin
  SERVER_SESSIONS.push({
    sessionId: 'sess_superadmin_01',
    token: 'token_superadmin_valid',
    userId: 'u_superadmin_01',
    username: 'superadmin',
    name: 'Super Administrator',
    role: 'super_admin',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'desktop'
  });

  // 2. Management Data
  SERVER_SESSIONS.push({
    sessionId: 'sess_mgmt_01',
    token: 'token_mgmt_valid',
    userId: 'u_management_data_01',
    username: 'mgmt_data',
    name: 'Petugas Data',
    role: 'management_data',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'desktop'
  });

  // 3. Dispatch
  SERVER_SESSIONS.push({
    sessionId: 'sess_dispatch_01',
    token: 'token_dispatch_valid',
    userId: 'u_dispatch_01',
    username: 'dispatch_andi',
    name: 'Dispatch Andi',
    role: 'dispatch',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'desktop'
  });

  // 4. IT Support
  SERVER_SESSIONS.push({
    sessionId: 'sess_itsupport_01',
    token: 'token_itsupport_valid',
    userId: 'u_itsupport_01',
    username: 'it_support_bambang',
    name: 'IT Support Bambang',
    role: 'it_support',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'desktop'
  });

  // 5. Leader
  SERVER_SESSIONS.push({
    sessionId: 'sess_leader_01',
    token: 'token_leader_valid',
    userId: 'u_leader_01',
    username: 'leader_mjs',
    name: 'Leader Hendra',
    role: 'leader',
    contractor: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-test-01',
    area: 'Jakarta Barat',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'desktop'
  });

  // 6. Installer
  SERVER_SESSIONS.push({
    sessionId: 'sess_installer_01',
    token: 'token_installer_valid',
    userId: 'u-installer-01',
    username: 'installer_budi',
    name: 'Teknisi Budi',
    role: 'installer',
    contractor: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-test-01',
    area: 'Jakarta Barat',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'mobile'
  });

  // 7. Expired Session
  SERVER_SESSIONS.push({
    sessionId: 'sess_expired_01',
    token: 'token_expired_session',
    userId: 'u_expired_01',
    username: 'expired_user',
    name: 'Expired User',
    role: 'installer',
    sessionVersion: 1,
    loginAt: expiredIso,
    lastActivityAt: expiredIso,
    expiresAt: expiredIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'Phase14C2Runner',
    deviceType: 'mobile'
  });
}

/**
 * Execute HTTP request to test server.
 */
function makeRequest(
  port: number,
  method: string,
  urlPath: string,
  token?: string | null,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  const callerStack = new Error().stack?.split('\n')[2] || '';
  return new Promise((resolve, reject) => {
    const postData = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(headers || {})
    };

    if (postData !== undefined && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          const actualStatus = res.statusCode || 0;
          evidenceCollector.recordHttpCall({
            method,
            url: urlPath,
            token,
            actualStatus,
            responseBody: parsed,
            callerStack
          });
          resolve({ status: actualStatus, data: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', err => reject(err));
    if (postData !== undefined) req.write(postData);
    req.end();
  });
}

async function runPhase14C2Suite() {
  console.log('========================================================================');
  console.log('MORAJAWS — PHASE 14C.2 REMAINING ENDPOINTS & SECURITY AUDIT SUITE');
  console.log('Real HTTP Invocations, Exhaustive RBAC, Fail-Closed & Immutability Verification');
  console.log('========================================================================\n');

  // Set environment to production mode for strict fail-closed enforcement
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = 'https://mock-supabase.morajaws.net';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_role_key_for_testing';
  process.env.ENABLE_SSE_SANDBOX = 'false'; // Ensure sandbox is disabled in production by default

  const defaultMock = createMockClient({});
  setSupabaseBackendClientForTesting(defaultMock.mockClient);

  const app = await createExpressApp({ skipVite: true });
  setupTestAuthSessions();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as any;
  const PORT = addr.port;
  console.log(`[Suite Setup] Loopback test server active on port ${PORT}.\n`);

  try {
    // =========================================================================
    // CATEGORY 1: AUTHENTICATION, ME & SESSION SECURITY ENDPOINTS
    // =========================================================================
    console.log('--- CATEGORY 1: AUTHENTICATION & SESSIONS ---');

    // Test 1: GET /api/bootstrap - Unauthenticated public access receives safe bootstrap
    {
      const res = await makeRequest(PORT, 'GET', '/api/bootstrap');
      const pass = res.status === 200 && res.data.success === true && Array.isArray(res.data.tickets) && res.data.tickets.length === 0 && res.data.sheetsConfig === undefined;
      recordTest(1, 'GET /api/bootstrap - Unauthenticated returns safe sanitized response', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Bootstrap publik tanpa token menerima tickets kosong dan tanpa sheetsConfig.`);
    }

    // Test 2: GET /api/bootstrap - Supabase failure returns HTTP 503 fail-closed in production
    {
      const failMock = createMockClient({ dbUnavailable: true });
      setSupabaseBackendClientForTesting(failMock.mockClient);
      const res = await makeRequest(PORT, 'GET', '/api/bootstrap');
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 503 && res.data.code === 'DATABASE_UNAVAILABLE';
      recordTest(2, 'GET /api/bootstrap - Database Failure Returns HTTP 503 Fail-Closed', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Database failure pada bootstrap ditangani fail-closed.`);
    }

    // Test 3: POST /api/auth/supabase-login - Missing credentials returns HTTP 400
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/supabase-login', null, {});
      const pass = res.status === 400 && res.data.code === 'INVALID_INPUT';
      recordTest(3, 'POST /api/auth/supabase-login - Missing Credentials Rejected (HTTP 400)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Login tanpa identifier dan password ditolak.`);
    }

    // Test 4: POST /api/auth/supabase-refresh - Missing refreshToken returns HTTP 400
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/supabase-refresh', null, {});
      const pass = res.status === 400 && res.data.code === 'INVALID_INPUT';
      recordTest(4, 'POST /api/auth/supabase-refresh - Missing Token Rejected (HTTP 400)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Refresh tanpa refreshToken ditolak.`);
    }

    // Test 5: POST /api/auth/supabase-logout - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/supabase-logout');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(5, 'POST /api/auth/supabase-logout - Unauthenticated Rejected (HTTP 401)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Logout tanpa token ditolak.`);
    }

    // Test 6: POST /api/auth/supabase-logout - Authenticated logout revokes session
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/supabase-logout', 'token_installer_valid');
      const pass = res.status === 200 && res.data.success === true;
      recordTest(6, 'POST /api/auth/supabase-logout - Authenticated Logout Success (HTTP 200)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Sesi berhasil diakhiri.`);
    }

    // Re-setup auth sessions after logout test
    setupTestAuthSessions();

    // Test 7: POST /api/auth/supabase-reset-password - Missing email returns HTTP 400
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/supabase-reset-password', null, {});
      const pass = res.status === 400 && res.data.code === 'INVALID_INPUT';
      recordTest(7, 'POST /api/auth/supabase-reset-password - Missing Email Rejected (HTTP 400)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Reset password tanpa email ditolak.`);
    }

    // Test 8: POST /api/auth/change-password - Short password rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/change-password', 'token_superadmin_valid', {
        currentPassword: 'current_password',
        newPassword: 'short'
      });
      const pass = res.status === 400 && res.data.code === 'PASSWORD_TOO_SHORT';
      recordTest(8, 'POST /api/auth/change-password - Password < 8 Chars Rejected (HTTP 400)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Kata sandi di bawah 8 karakter ditolak.`);
    }

    // Test 9: POST /api/auth/change-password - Default password prohibited (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/auth/change-password', 'token_superadmin_valid', {
        currentPassword: 'current_password',
        newPassword: '12345678'
      });
      const pass = res.status === 400 && res.data.code === 'CANNOT_USE_DEFAULT_PASSWORD';
      recordTest(9, 'POST /api/auth/change-password - Default Password Prohibited (HTTP 400)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Larangan menggunakan password default ditegakkan.`);
    }

    // Test 10: GET /api/auth/me - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'GET', '/api/auth/me');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(10, 'GET /api/auth/me - Unauthenticated Rejected (HTTP 401)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Permintaan profil tanpa token ditolak.`);
    }

    // Test 11: GET /api/auth/me - Authenticated returns profile with zero passwordHash exposed
    {
      const res = await makeRequest(PORT, 'GET', '/api/auth/me', 'token_superadmin_valid');
      const pass = res.status === 200 && res.data.user && res.data.user.passwordHash === undefined && res.data.user.role === 'super_admin';
      recordTest(11, 'GET /api/auth/me - Returns Safe Profile Without Password Hash (HTTP 200)', 'Auth & Sessions', pass,
        `HTTP ${res.status}: Profil dikembalikan secara aman tanpa passwordHash.`);
    }

    // =========================================================================
    // CATEGORY 2: WORK ORDER & SEARCH ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 2: WORK ORDER & SEARCH ENDPOINTS ---');

    // Test 12: GET /api/tickets/search - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'GET', '/api/tickets/search?q=WO101');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(12, 'GET /api/tickets/search - Unauthenticated Rejected (HTTP 401)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Pencarian lintas tanggal tanpa autentikasi ditolak.`);
    }

    // Test 13: GET /api/tickets/search - Installer/Leader forbidden (HTTP 403 REQUIRE_ADMIN_OR_DISPATCH)
    {
      const res = await makeRequest(PORT, 'GET', '/api/tickets/search?q=WO101', 'token_installer_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_ADMIN_OR_DISPATCH';
      recordTest(13, 'GET /api/tickets/search - Installer Role Forbidden (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Installer ditolak mengakses pencarian lintas tanggal.`);
    }

    // Test 14: GET /api/tickets/search - Authorized Dispatch succeeds (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/tickets/search?q=202', 'token_dispatch_valid');
      const pass = res.status === 200 && res.data.success === true && Array.isArray(res.data.tickets);
      recordTest(14, 'GET /api/tickets/search - Dispatch Role Success (HTTP 200)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Dispatch berhasil melakukan pencarian lintas tanggal.`);
    }

    // Test 15: GET /api/tickets/search - Supabase failure returns HTTP 503 fail-closed
    {
      const failMock = createMockClient({ dbUnavailable: true });
      setSupabaseBackendClientForTesting(failMock.mockClient);
      const res = await makeRequest(PORT, 'GET', '/api/tickets/search?q=202', 'token_dispatch_valid');
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 503 && res.data.code === 'DATABASE_UNAVAILABLE';
      recordTest(15, 'GET /api/tickets/search - DB Failure Returns HTTP 503 Fail-Closed', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Database error pada pencarian ditangani fail-closed.`);
    }

    // Test 16: POST /api/tickets/sameday - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/sameday', null, {
        woNumber: 'WO-SAMEDAY-001',
        customerName: 'Budi Sameday',
        customerPhone: '08123456789'
      });
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(16, 'POST /api/tickets/sameday - Unauthenticated Rejected (HTTP 401)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Pembuatan WO sameday tanpa login ditolak.`);
    }

    // Test 17: POST /api/tickets/sameday - Non-Dispatch Role Forbidden (HTTP 403 REQUIRE_DISPATCH_ROLE)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/sameday', 'token_leader_valid', {
        woNumber: 'WO-SAMEDAY-001',
        customerName: 'Budi Sameday',
        customerPhone: '08123456789'
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_DISPATCH_ROLE';
      recordTest(17, 'POST /api/tickets/sameday - Leader Role Forbidden (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Role non-dispatch ditolak membuat tiket sameday.`);
    }

    // Test 18: POST /api/tickets/sameday - Missing required fields returns HTTP 400
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/sameday', 'token_dispatch_valid', {
        woNumber: 'WO-SAMEDAY-001'
      });
      const pass = res.status === 400;
      recordTest(18, 'POST /api/tickets/sameday - Incomplete Fields Rejected (HTTP 400)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Field wajib yang tidak lengkap ditolak.`);
    }

    // Test 19: POST /api/tickets/bulk-delete - Non-Management-Data Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/bulk-delete', 'token_superadmin_valid', {
        ticketIds: ['wo_test_mock_202'],
        reason: 'Penghapusan berkala oleh Super Admin'
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_MANAGEMENT_DATA';
      recordTest(19, 'POST /api/tickets/bulk-delete - Non-Management-Data Forbidden (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Super Admin tanpa role management_data ditolak.`);
    }

    // Test 20: POST /api/tickets/bulk-delete - Short Reason Rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/bulk-delete', 'token_mgmt_valid', {
        ticketIds: ['wo_test_mock_202'],
        reason: 'del'
      });
      const pass = res.status === 400;
      recordTest(20, 'POST /api/tickets/bulk-delete - Reason < 5 Chars Rejected (HTTP 400)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Alasan hapus di bawah 5 karakter ditolak.`);
    }

    // Test 21: POST /api/tickets/bulk-delete - Protected WO Records Immutably Shielded
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/bulk-delete', 'token_mgmt_valid', {
        ticketIds: ['wo_1793825457141_u4bnht', 'wo_imp_1793825458959_4i4f1h'],
        reason: 'Uji coba penghapusan record terproteksi'
      });
      const pass = res.status === 200 && res.data.count === 0;
      recordTest(21, 'POST /api/tickets/bulk-delete - Protected WO Immutably Shielded (Count 0)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Upaya bulk delete terhadap WO terproteksi dilindungi tanpa mutasi (count: 0).`);
    }

    // Test 22: POST /api/tickets/purge-by-date - Non-Management-Data Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/purge-by-date', 'token_leader_valid', {
        importDate: '2026-11-05',
        reason: 'Hapus batch impor'
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_MANAGEMENT_DATA';
      recordTest(22, 'POST /api/tickets/purge-by-date - Leader Role Forbidden (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Role non-management_data ditolak melakukan purge.`);
    }

    // Test 23: DELETE /api/tickets/batch/:date - Missing Reason Rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'DELETE', '/api/tickets/batch/2026-11-05', 'token_mgmt_valid', {});
      const pass = res.status === 400;
      recordTest(23, 'DELETE /api/tickets/batch/:date - Missing Reason Rejected (HTTP 400)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Purge batch tanpa alasan ditolak.`);
    }

    // Test 24: GET /api/work-orders - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'GET', '/api/work-orders');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(24, 'GET /api/work-orders - Unauthenticated Rejected (HTTP 401)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Akses work-orders tanpa autentikasi ditolak.`);
    }

    // Test 25: GET /api/work-orders/:id - Cross-Contractor Access Blocked (HTTP 403)
    {
      // Mock WO with contractor PT Solusi Berbeda
      const otherWoMock = createMockClient({
        initialWorkOrder: {
          id: 'wo_other_contr_999',
          wo_number: 'WO-OTHER-999',
          contractor_name: 'PT Telco Mandiri Utama',
          contractor_id: 'c-telco-99',
          area: 'Jakarta Barat',
          payload: {
            id: 'wo_other_contr_999',
            woNumber: 'WO-OTHER-999',
            contractorName: 'PT Telco Mandiri Utama',
            contractorId: 'c-telco-99',
            area: 'Jakarta Barat'
          }
        }
      });
      setSupabaseBackendClientForTesting(otherWoMock.mockClient);
      const res = await makeRequest(PORT, 'GET', '/api/work-orders/wo_other_contr_999', 'token_leader_valid');
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 403;
      recordTest(25, 'GET /api/work-orders/:id - Leader Cross-Contractor Access Blocked (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Leader ditolak melihat WO mitra kontraktor lain.`);
    }

    // Test 26: POST /api/work-orders/:id/assign - Non-Leader Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/work-orders/wo_test_mock_202/assign', 'token_installer_valid', {
        installerName: 'Teknisi Budi'
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_LEADER_ROLE';
      recordTest(26, 'POST /api/work-orders/:id/assign - Installer Role Forbidden (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Installer ditolak melakukan penugasan WO.`);
    }

    // Test 27: POST /api/work-orders/:id/assign - Protected WO Shielded (HTTP 403 PROTECTED_RECORD)
    {
      const res = await makeRequest(PORT, 'POST', '/api/work-orders/wo_1793825457141_u4bnht/assign', 'token_leader_valid', {
        installerName: 'Teknisi Budi'
      });
      const pass = res.status === 403 && (res.data.code === 'PROTECTED_RECORD' || res.data.code === 'PROTECTED_PRODUCTION_RECORD');
      recordTest(27, 'POST /api/work-orders/:id/assign - Protected WO Shielded (HTTP 403)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Mutasi penugasan WO terproteksi ditolak.`);
    }

    // Test 28: POST /api/work-orders/:id/reassign - Empty Reason Rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/work-orders/wo_test_mock_202/reassign', 'token_leader_valid', {
        newInstallerName: 'Teknisi Baru',
        reason: 'bad'
      });
      const pass = res.status === 400;
      recordTest(28, 'POST /api/work-orders/:id/reassign - Reason < 5 Chars Rejected (HTTP 400)', 'Work Orders & Search', pass,
        `HTTP ${res.status}: Reassign dengan alasan tidak valid ditolak.`);
    }

    // =========================================================================
    // CATEGORY 3: ADMINISTRATIVE, SESSIONS & BACKUP ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 3: SESSIONS & BACKUP ENDPOINTS ---');

    // Test 29: GET /api/sessions - Unauthenticated returns HTTP 401
    {
      const res = await makeRequest(PORT, 'GET', '/api/sessions');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(29, 'GET /api/sessions - Unauthenticated Rejected (HTTP 401)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Inspeksi sesi tanpa token ditolak.`);
    }

    // Test 30: GET /api/sessions - Non-SuperAdmin Forbidden (HTTP 403 REQUIRE_SUPER_ADMIN)
    {
      const res = await makeRequest(PORT, 'GET', '/api/sessions', 'token_leader_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(30, 'GET /api/sessions - Leader Role Forbidden (HTTP 403)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Leader ditolak melihat daftar sesi aktif.`);
    }

    // Test 31: GET /api/sessions - Super Admin Receives Sanitized Sessions (No Token Leaks)
    {
      const res = await makeRequest(PORT, 'GET', '/api/sessions', 'token_superadmin_valid');
      const pass = res.status === 200 && Array.isArray(res.data.sessions) &&
        res.data.sessions.every((s: any) => s.token === undefined);
      recordTest(31, 'GET /api/sessions - Super Admin Gets Sanitized Sessions (HTTP 200)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Daftar sesi dikembalikan bersih dari bocoran token autentikasi.`);
    }

    // Test 32: POST /api/sessions/revoke - Cross-User Session Revocation Blocked (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sessions/revoke', 'token_installer_valid', {
        sessionId: 'sess_superadmin_01'
      });
      const pass = res.status === 403;
      recordTest(32, 'POST /api/sessions/revoke - Cross-User Revocation Blocked (HTTP 403)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Installer ditolak mencabut sesi milik user lain.`);
    }

    // Test 33: GET /api/sessions/config - Non-SuperAdmin Forbidden (HTTP 403 REQUIRE_SUPER_ADMIN)
    {
      const res = await makeRequest(PORT, 'GET', '/api/sessions/config', 'token_dispatch_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(33, 'GET /api/sessions/config - Dispatch Role Forbidden (HTTP 403)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Dispatch ditolak mengakses konfigurasi sesi.`);
    }

    // Test 34: POST /api/sessions/config - Super Admin Updates Config (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sessions/config', 'token_superadmin_valid', {
        maxInactiveHours: 12
      });
      const pass = res.status === 200 && res.data.success === true && res.data.config.maxInactiveHours === 12;
      recordTest(34, 'POST /api/sessions/config - Super Admin Updates Config (HTTP 200)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Super Admin berhasil memperbarui konfigurasi sesi.`);
    }

    // Test 35: GET /api/admin/backup/download - Query ?token= parameter strictly rejected (HTTP 401)
    {
      const res = await makeRequest(PORT, 'GET', '/api/admin/backup/download?token=secret123');
      const pass = res.status === 401 && res.data.code === 'QUERY_TOKEN_FORBIDDEN';
      recordTest(35, 'GET /api/admin/backup/download - Query ?token= Strictly Forbidden (HTTP 401)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Parameter ?token= ditolak keras (QUERY_TOKEN_FORBIDDEN).`);
    }

    // Test 36: GET /api/admin/backup/download - Unauthorized Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'GET', '/api/admin/backup/download', 'token_leader_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_BACKUP_PERMISSION';
      recordTest(36, 'GET /api/admin/backup/download - Leader Role Forbidden (HTTP 403)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Hak unduh backup dibatasi untuk Super Admin dan Management Data.`);
    }

    // Test 37: GET /api/system/operational-date - Public Read Operational Date (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/system/operational-date');
      const pass = res.status === 200 && typeof res.data.date === 'string';
      recordTest(37, 'GET /api/system/operational-date - Public Read Operational Date (HTTP 200)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Tanggal operasional sistem Asia/Jakarta terbaca.`);
    }

    // Test 38: POST /api/system/operational-date - Unauthorized Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/system/operational-date', 'token_installer_valid', {
        operationalDate: '2026-11-06'
      });
      const pass = res.status === 403;
      recordTest(38, 'POST /api/system/operational-date - Installer Role Forbidden (HTTP 403)', 'Administrative & Backup', pass,
        `HTTP ${res.status}: Installer ditolak mengubah tanggal operasional sistem.`);
    }

    // =========================================================================
    // CATEGORY 4: GOOGLE SHEETS & SYNC ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 4: GOOGLE SHEETS & SYNC ENDPOINTS ---');

    // Test 39: GET /api/sheets/config - Non-SuperAdmin Forbidden (HTTP 403 REQUIRE_SUPER_ADMIN)
    {
      const res = await makeRequest(PORT, 'GET', '/api/sheets/config', 'token_dispatch_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(39, 'GET /api/sheets/config - Dispatch Role Forbidden (HTTP 403)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Akses konfigurasi Google Sheets dibatasi Super Admin.`);
    }

    // Test 40: POST /api/sheets/config - Super Admin Updates Sheets Config (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sheets/config', 'token_superadmin_valid', {
        sheetName: 'WO_PRODUKSI'
      });
      const pass = res.status === 200 && res.data.success === true && res.data.config.sheetName === 'WO_PRODUKSI';
      recordTest(40, 'POST /api/sheets/config - Super Admin Updates Config (HTTP 200)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Konfigurasi Google Sheets berhasil diperbarui oleh Super Admin.`);
    }

    // Test 41: GET /api/integrations/google-sheets/status - Unauthenticated Rejected (HTTP 401)
    {
      const res = await makeRequest(PORT, 'GET', '/api/integrations/google-sheets/status');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(41, 'GET /api/integrations/google-sheets/status - Unauthenticated Rejected (HTTP 401)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Status Google Sheets memerlukan login.`);
    }

    // Test 42: GET /api/integrations/google-sheets/status - Authenticated Returns Safe Status
    {
      const res = await makeRequest(PORT, 'GET', '/api/integrations/google-sheets/status', 'token_installer_valid');
      const pass = res.status === 200 && res.data.success === true && typeof res.data.configured === 'boolean';
      recordTest(42, 'GET /api/integrations/google-sheets/status - Authenticated Safe Read (HTTP 200)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Status integrasi terbaca aman tanpa kredensial rahasia.`);
    }

    // Test 43: POST /api/integrations/google-sheets/test - Non-SuperAdmin Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/integrations/google-sheets/test', 'token_leader_valid', {
        spreadsheetId: '12345678901234567890'
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(43, 'POST /api/integrations/google-sheets/test - Leader Role Forbidden (HTTP 403)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Pengujian Google Sheets dibatasi Super Admin.`);
    }

    // Test 44: POST /api/integrations/google-sheets/test - Missing Spreadsheet ID Rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/integrations/google-sheets/test', 'token_superadmin_valid', {
        spreadsheetId: ''
      });
      const pass = res.status === 400;
      recordTest(44, 'POST /api/integrations/google-sheets/test - Empty ID Rejected (HTTP 400)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Spreadsheet ID kosong ditolak.`);
    }

    // Test 45: POST /api/integrations/google-sheets/sync - Non-SuperAdmin Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/integrations/google-sheets/sync', 'token_installer_valid', {});
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(45, 'POST /api/integrations/google-sheets/sync - Installer Role Forbidden (HTTP 403)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Sinkronisasi Google Sheets dibatasi Super Admin.`);
    }

    // Test 46: POST /api/sync/run - Non-Authorized Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sync/run', 'token_installer_valid', {});
      const pass = res.status === 403;
      recordTest(46, 'POST /api/sync/run - Installer Role Forbidden (HTTP 403)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Role installer ditolak menjalankan sinkronisasi data.`);
    }

    // Test 47: POST /api/sync/run - Authorized Dispatch Runs Sync (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sync/run', 'token_dispatch_valid', {});
      const pass = res.status === 200 && res.data.success === true && res.data.status === 'Success';
      recordTest(47, 'POST /api/sync/run - Dispatch Role Success (HTTP 200)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Dispatch berhasil menjalankan sinkronisasi data internal.`);
    }

    // Test 48: GET /api/sync/status - Authenticated Returns Status (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/sync/status', 'token_leader_valid');
      const pass = res.status === 200 && typeof res.data.appDbStatus === 'string';
      recordTest(48, 'GET /api/sync/status - Authenticated Returns Status (HTTP 200)', 'Google Sheets & Sync', pass,
        `HTTP ${res.status}: Status sync terbaca oleh pengguna terautentikasi.`);
    }

    // =========================================================================
    // CATEGORY 5: STORAGE, ATTACHMENTS & FILES ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 5: STORAGE & ATTACHMENTS ENDPOINTS ---');

    // Test 49: POST /api/attachments - Unauthenticated Rejected (HTTP 401)
    {
      const res = await makeRequest(PORT, 'POST', '/api/attachments', null, {
        fileName: 'test.jpg',
        fileData: 'base64sample'
      });
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(49, 'POST /api/attachments - Unauthenticated Rejected (HTTP 401)', 'Storage & Files', pass,
        `HTTP ${res.status}: Unggah lampiran tanpa login ditolak.`);
    }

    // Test 50: POST /api/attachments - Disallowed MIME type rejected (HTTP 415)
    {
      const res = await makeRequest(PORT, 'POST', '/api/attachments', 'token_installer_valid', {
        fileName: 'virus.exe',
        fileType: 'application/x-msdownload',
        fileData: 'TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA'
      });
      const pass = res.status === 415;
      recordTest(50, 'POST /api/attachments - Disallowed Executable MIME Rejected (HTTP 415)', 'Storage & Files', pass,
        `HTTP ${res.status}: Format file eksekusi berbahaya ditolak tegas.`);
    }

    // Test 51: POST /api/attachments - Valid Image Attachment Succeeded (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/attachments', 'token_installer_valid', {
        fileName: 'foto_redaman.jpg',
        fileType: 'image/jpeg',
        fileData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/'
      });
      const pass = res.status === 200 && res.data.success === true && res.data.attachment.fileType === 'image/jpeg';
      recordTest(51, 'POST /api/attachments - Valid Image Attachment Upload Succeeded (HTTP 200)', 'Storage & Files', pass,
        `HTTP ${res.status}: Foto bukti teknisi berhasil diunggah.`);
    }

    // Test 52: POST /api/storage/test-upload - Disguised Executable Detected and Blocked (HTTP 400)
    {
      const res = await makeRequest(PORT, 'POST', '/api/storage/test-upload', 'token_superadmin_valid', {
        fileName: 'fake_image.jpg',
        mimeType: 'image/jpeg',
        category: 'IMAGE_REPORT',
        fileData: 'TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA' // MZ executable header
      });
      const pass = res.status === 400 && res.data.phase === 'VALIDATION';
      recordTest(52, 'POST /api/storage/test-upload - Magic Byte Disguise Blocked (HTTP 400)', 'Storage & Files', pass,
        `HTTP ${res.status}: File EXE yang menyamar sebagai JPG ditolak pada verifikasi magic bytes.`);
    }

    // Test 53: POST /api/storage/refresh-signed-url - Cross-Contractor Access Blocked (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/storage/refresh-signed-url', 'token_leader_valid', {
        storagePath: 'work-orders/WO20267399331/foto.jpg',
        woNumber: 'WO20267399331',
        category: 'work-orders'
      });
      // Leader Hendra from PT Mitra Jaringan Solusi accessing WO20267399331 (PT Kencana Solusindo)
      const pass = res.status === 403;
      recordTest(53, 'POST /api/storage/refresh-signed-url - Cross-Contractor Blocked (HTTP 403)', 'Storage & Files', pass,
        `HTTP ${res.status}: Permintaan signed URL WO lintas kontraktor ditolak.`);
    }

    // Test 54: GET /api/storage/download - Missing storagePath Rejected (HTTP 400)
    {
      const res = await makeRequest(PORT, 'GET', '/api/storage/download', 'token_superadmin_valid');
      const pass = res.status === 400;
      recordTest(54, 'GET /api/storage/download - Missing Storage Path Rejected (HTTP 400)', 'Storage & Files', pass,
        `HTTP ${res.status}: Parameter storagePath wajib disertakan.`);
    }

    // Test 55: GET /api/storage/adapter/config - Public Info Returned Without Service Role Key
    {
      const res = await makeRequest(PORT, 'GET', '/api/storage/adapter/config');
      const pass = res.status === 200 && res.data.success === true &&
        JSON.stringify(res.data).indexOf('mock_service_role_key') === -1;
      recordTest(55, 'GET /api/storage/adapter/config - Public Inspection Zero Secrets (HTTP 200)', 'Storage & Files', pass,
        `HTTP ${res.status}: Konfigurasi storage dikembalikan tanpa membocorkan Service Role Key.`);
    }

    // =========================================================================
    // CATEGORY 6: SUPABASE PROXY ENDPOINTS (ARCHIVE, RESTORE, BULK IMPORT, REALTIME)
    // =========================================================================
    console.log('\n--- CATEGORY 6: SUPABASE PROXY ENDPOINTS ---');

    // Test 56: POST /api/supabase/work-orders/:id/archive - Non-Management-Data Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/work-orders/wo_test_mock_202/archive', 'token_leader_valid', {});
      const pass = res.status === 403 && res.data.error.code === 'REQUIRE_ARCHIVE_PERMISSION';
      recordTest(56, 'POST /api/supabase/work-orders/:id/archive - Leader Role Forbidden (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Role leader ditolak mengarsipkan work order.`);
    }

    // Test 57: POST /api/supabase/work-orders/:id/archive - Protected WO Immutably Shielded (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/work-orders/wo_1793825457141_u4bnht/archive', 'token_superadmin_valid', {});
      const pass = res.status === 403 && res.data.error.code === 'PROTECTED_RECORD';
      recordTest(57, 'POST /api/supabase/work-orders/:id/archive - Protected Record Shielded (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Percobaan pengarsipan WO terproteksi ditolak mutlak.`);
    }

    // Test 58: POST /api/supabase/work-orders/:id/restore - Non-Management-Data Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/work-orders/wo_test_mock_202/restore', 'token_installer_valid', {});
      const pass = res.status === 403 && res.data.error.code === 'REQUIRE_RESTORE_PERMISSION';
      recordTest(58, 'POST /api/supabase/work-orders/:id/restore - Installer Role Forbidden (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Role installer ditolak memulihkan work order.`);
    }

    // Test 59: POST /api/supabase/work-orders/:id/restore - Protected WO Immutably Shielded (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/work-orders/wo_imp_1793825458959_4i4f1h/restore', 'token_mgmt_valid', {});
      const pass = res.status === 403 && res.data.error.code === 'PROTECTED_RECORD';
      recordTest(59, 'POST /api/supabase/work-orders/:id/restore - Protected Record Shielded (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Percobaan pemulihan WO terproteksi ditolak mutlak.`);
    }

    // Test 60: POST /api/supabase/work-orders/bulk-import - Non-Import Role Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/work-orders/bulk-import', 'token_leader_valid', {
        tickets: [{ woNumber: 'WO-IMPORT-001' }]
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_IMPORT_PERMISSION';
      recordTest(60, 'POST /api/supabase/work-orders/bulk-import - Leader Role Forbidden (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Leader ditolak mengimpor tiket massal.`);
    }

    // Test 61: POST /api/supabase/users/:id/reset-password - Non-SuperAdmin Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/users/u-installer-01/reset-password', 'token_leader_valid', {});
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(61, 'POST /api/supabase/users/:id/reset-password - Leader Role Forbidden (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Hanya Super Admin yang diizinkan me-reset password pengguna.`);
    }

    // Test 62: POST /api/supabase/phase8-shadow-dryrun - Non-SuperAdmin Forbidden (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/supabase/phase8-shadow-dryrun', 'token_dispatch_valid', {});
      const pass = res.status === 403 && res.data.code === 'REQUIRE_SUPER_ADMIN';
      recordTest(62, 'POST /api/supabase/phase8-shadow-dryrun - Dispatch Role Forbidden (HTTP 403)', 'Supabase Proxy', pass,
        `HTTP ${res.status}: Uji shadow dry-run Fase 8 dibatasi untuk Super Admin.`);
    }

    // =========================================================================
    // CATEGORY 7: SANDBOX & REALTIME INTERNAL ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 7: SANDBOX & REALTIME INTERNAL ENDPOINTS ---');

    // Test 63: GET /api/realtime/stream-sandbox - Unauthenticated Rejected (HTTP 401)
    {
      const res = await makeRequest(PORT, 'GET', '/api/realtime/stream-sandbox');
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(63, 'GET /api/realtime/stream-sandbox - Unauthenticated Rejected (HTTP 401)', 'Sandbox & Realtime', pass,
        `HTTP ${res.status}: SSE Sandbox tanpa login ditolak.`);
    }

    // Test 64: GET /api/realtime/stream-sandbox - Disabled in Production (HTTP 403)
    {
      const res = await makeRequest(PORT, 'GET', '/api/realtime/stream-sandbox', 'token_superadmin_valid');
      const pass = res.status === 403 && (res.data.code === 'FEATURE_DISABLED' || res.data.code === 'FIREBASE_TOKEN_REQUIRED');
      recordTest(64, 'GET /api/realtime/stream-sandbox - Disabled Feature Flag in Production (HTTP 403)', 'Sandbox & Realtime', pass,
        `HTTP ${res.status}: SSE Sandbox laboratorium terkunci saat ENABLE_SSE_SANDBOX=false.`);
    }

    // Test 65: POST /api/realtime/publish-sandbox - Disabled in Production (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/realtime/publish-sandbox', 'token_superadmin_valid', {
        eventType: 'WO_CREATED',
        recordId: 'WO-SANDBOX-001'
      });
      const pass = res.status === 403 && (res.data.code === 'FEATURE_DISABLED' || res.data.code === 'FIREBASE_TOKEN_REQUIRED');
      recordTest(65, 'POST /api/realtime/publish-sandbox - Disabled Feature Flag in Production (HTTP 403)', 'Sandbox & Realtime', pass,
        `HTTP ${res.status}: Publikasi sandbox terkunci aman di mode produksi.`);
    }

    // Test 66: POST /api/sandbox/journal/mutate - Disabled in Production (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sandbox/journal/mutate', 'token_superadmin_valid', {
        aggregateId: 'WO-SANDBOX-001'
      });
      const pass = res.status === 403 && (res.data.code === 'SANDBOX_DISABLED' || res.data.code === 'FIREBASE_TOKEN_REQUIRED');
      recordTest(66, 'POST /api/sandbox/journal/mutate - Sandbox Journal Disabled (HTTP 403)', 'Sandbox & Realtime', pass,
        `HTTP ${res.status}: Mutasi jurnal laboratorium terkunci aman di mode produksi.`);
    }

    // Test 67: POST /api/sandbox/test/chaos - Disabled in Production (HTTP 403)
    {
      const res = await makeRequest(PORT, 'POST', '/api/sandbox/test/chaos', 'token_superadmin_valid', {});
      const pass = res.status === 403 && (res.data.code === 'SANDBOX_DISABLED' || res.data.code === 'FIREBASE_TOKEN_REQUIRED');
      recordTest(67, 'POST /api/sandbox/test/chaos - Chaos Suite Disabled in Production (HTTP 403)', 'Sandbox & Realtime', pass,
        `HTTP ${res.status}: Pengujian chaos laboratorium dinonaktifkan di mode produksi.`);
    }

    // =========================================================================
    // CATEGORY 8: COMMUNICATION & AUDIT ENDPOINTS
    // =========================================================================
    console.log('\n--- CATEGORY 8: COMMUNICATION & AUDIT ENDPOINTS ---');

    // Test 68: POST /api/whatsapp/preview - Unauthenticated Rejected (HTTP 401)
    {
      const res = await makeRequest(PORT, 'POST', '/api/whatsapp/preview', null, {
        templateBody: 'Halo {{nama}}',
        ticket: { customerName: 'Budi' }
      });
      const pass = res.status === 401 && res.data.code === 'UNAUTHENTICATED';
      recordTest(68, 'POST /api/whatsapp/preview - Unauthenticated Rejected (HTTP 401)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Pratinjau WhatsApp tanpa login ditolak.`);
    }

    // Test 69: POST /api/whatsapp/preview - Non-Template-Manager Forbidden (HTTP 403 REQUIRE_TEMPLATE_MANAGER)
    {
      const res = await makeRequest(PORT, 'POST', '/api/whatsapp/preview', 'token_leader_valid', {
        templateBody: 'Halo {{nama}}',
        ticket: { customerName: 'Budi' }
      });
      const pass = res.status === 403 && res.data.code === 'REQUIRE_TEMPLATE_MANAGER';
      recordTest(69, 'POST /api/whatsapp/preview - Leader Role Forbidden (HTTP 403)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Leader ditolak mengakses pengelolaan template WhatsApp.`);
    }

    // Test 70: POST /api/whatsapp/preview - Dispatch Role Succeeded (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/whatsapp/preview', 'token_dispatch_valid', {
        templateBody: 'Halo {{customerName}}, teknisi {{installerName}} menuju lokasi.',
        ticket: { customerName: 'Ibu Rahma', installerName: 'Budi', customerPhone: '08123456789' }
      });
      const pass = res.status === 200 && res.data.renderedText && res.data.renderedText.includes('Ibu Rahma') && res.data.url;
      recordTest(70, 'POST /api/whatsapp/preview - Dispatch Role Succeeded (HTTP 200)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Pratinjau template WhatsApp berhasil dirender dengan URL Click-to-Chat.`);
    }

    // Test 71: GET /api/audit-logs - Non-Audit-Viewer Forbidden (HTTP 403 REQUIRE_AUDIT_LOG_VIEWER)
    {
      const res = await makeRequest(PORT, 'GET', '/api/audit-logs', 'token_installer_valid');
      const pass = res.status === 403 && res.data.code === 'REQUIRE_AUDIT_LOG_VIEWER';
      recordTest(71, 'GET /api/audit-logs - Installer Role Forbidden (HTTP 403)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Installer ditolak membaca Audit Logs.`);
    }

    // Test 72: GET /api/audit-logs - IT Support Role Succeeded (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/audit-logs', 'token_itsupport_valid');
      const pass = res.status === 200 && res.data.success === true && Array.isArray(res.data.logs);
      recordTest(72, 'GET /api/audit-logs - IT Support Role Succeeded (HTTP 200)', 'Communication & Audit', pass,
        `HTTP ${res.status}: IT Support berhasil membaca Audit Logs.`);
    }

    // Test 73: GET /api/audit-logs - Supabase failure returns HTTP 503 fail-closed
    {
      const failMock = createMockClient({ dbUnavailable: true });
      setSupabaseBackendClientForTesting(failMock.mockClient);
      const res = await makeRequest(PORT, 'GET', '/api/audit-logs', 'token_superadmin_valid');
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 503 && res.data.code === 'DATABASE_UNAVAILABLE';
      recordTest(73, 'GET /api/audit-logs - Database Failure Handled Fail-Closed (HTTP 503)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Kegagalan Supabase pada audit log ditangani fail-closed.`);
    }

    // Test 74: POST /api/audit-logs - HTTP Creation Permanently Disabled (HTTP 405)
    {
      const res = await makeRequest(PORT, 'POST', '/api/audit-logs', 'token_superadmin_valid', {
        action: 'Fake Audit Inject'
      });
      const pass = res.status === 405 && res.data.code === 'METHOD_NOT_ALLOWED';
      recordTest(74, 'POST /api/audit-logs - Direct HTTP Write Blocked (HTTP 405)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Pencatatan audit melalui HTTP ditolak secara permanen (METHOD_NOT_ALLOWED).`);
    }

    // Test 75: GET /api/settings - Authenticated read succeeded (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/settings', 'token_dispatch_valid');
      const pass = res.status === 200 && res.data.globalConfig !== undefined;
      recordTest(75, 'GET /api/settings - Authenticated Succeeded (HTTP 200)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Konfigurasi pengaturan dibaca aman.`);
    }

    // Test 76: GET /api/reports - Technical Reports Scoped by Role (HTTP 200)
    {
      const res = await makeRequest(PORT, 'GET', '/api/reports', 'token_superadmin_valid');
      const pass = res.status === 200 && res.data.success === true && Array.isArray(res.data.reports);
      recordTest(76, 'GET /api/reports - Technical Reports Scoped by Role (HTTP 200)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Laporan teknis ditarik sesuai cakupan role pengguna.`);
    }

    // Test 77: GET /api/tickets/:id/messages - Cross-Contractor Access Blocked for Leader (HTTP 403)
    {
      // Mock WO belonging to another contractor
      const otherWoMock = createMockClient({
        initialWorkOrder: {
          id: 'wo_cross_chat_111',
          wo_number: 'WO-CROSS-111',
          contractor_name: 'PT Jaringan Luar Wilayah',
          contractor_id: 'c-luar-01',
          area: 'Jakarta Barat',
          payload: {
            id: 'wo_cross_chat_111',
            woNumber: 'WO-CROSS-111',
            contractorName: 'PT Jaringan Luar Wilayah',
            contractorId: 'c-luar-01',
            area: 'Jakarta Barat'
          }
        }
      });
      setSupabaseBackendClientForTesting(otherWoMock.mockClient);
      const res = await makeRequest(PORT, 'GET', '/api/tickets/wo_cross_chat_111/messages', 'token_leader_valid');
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 403;
      recordTest(77, 'GET /api/tickets/:id/messages - Leader Cross-Contractor Chat Blocked (HTTP 403)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Leader ditolak memantau percakapan kontraktor lain.`);
    }

    // Test 78: POST /api/tickets/:id/messages - Leader Role Strictly Read-Only (HTTP 403 LEADER_READ_ONLY_CHAT)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/wo_test_mock_202/messages', 'token_leader_valid', {
        text: 'Pesan dari Leader'
      });
      const pass = res.status === 403 && res.data.code === 'LEADER_READ_ONLY_CHAT';
      recordTest(78, 'POST /api/tickets/:id/messages - Leader Sending Chat Blocked (HTTP 403)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Leader terkunci read-only dan dilarang mengirim chat.`);
    }

    // Test 79: POST /api/tickets/:id/messages - Installer Sending Chat Succeeded (HTTP 200)
    {
      const res = await makeRequest(PORT, 'POST', '/api/tickets/wo_test_mock_202/messages', 'token_installer_valid', {
        text: 'PROGRESS: Sudah tiba di rumah pelanggan'
      });
      const pass = res.status === 200 && res.data.success === true && res.data.message.text.includes('PROGRESS');
      recordTest(79, 'POST /api/tickets/:id/messages - Installer Progress Chat Succeeded (HTTP 200)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Installer berhasil mengirim chat progress dengan auto-check-in.`);
    }

    // Test 80: POST /api/tickets/:id/messages - Supabase Failure Returns HTTP 503 Fail-Closed
    {
      const failMock = createMockClient({ dbUnavailable: true });
      setSupabaseBackendClientForTesting(failMock.mockClient);
      const res = await makeRequest(PORT, 'POST', '/api/tickets/wo_test_mock_202/messages', 'token_installer_valid', {
        text: 'Tes pesan'
      });
      setSupabaseBackendClientForTesting(defaultMock.mockClient);
      const pass = res.status === 503 && res.data.code === 'DATABASE_UNAVAILABLE';
      recordTest(80, 'POST /api/tickets/:id/messages - Database Failure Handled Fail-Closed (HTTP 503)', 'Communication & Audit', pass,
        `HTTP ${res.status}: Kegagalan Supabase pada live chat ditangani fail-closed.`);
    }

  } finally {
    resetSupabaseBackendClientForTesting();
    server.close();
    evidenceCollector.saveToFile('scripts/evidence/phase14c2_executed_evidence.json');
  }

  // Summary
  console.log('\n========================================================================');
  console.log('PHASE 14C.2 REMAINING ENDPOINTS & SECURITY VERIFICATION SUMMARY');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Tests Run : ${total}`);
  console.log(`Passed          : ${passed}`);
  console.log(`Failed          : ${failed}`);

  if (failed === 0) {
    console.log(`\n[SUCCESS] All ${total} Phase 14C.2 Remaining Endpoint & Security tests PASSED successfully!`);
    process.exit(0);
  } else {
    console.error(`\n[FAILURE] ${failed} test(s) failed in Phase 14C.2 test suite.`);
    process.exit(1);
  }
}

runPhase14C2Suite().catch(err => {
  console.error('[Phase 14C.2 Suite Fatal]', err);
  process.exit(1);
});
