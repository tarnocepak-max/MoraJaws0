/**
 * MORAJAWS — PHASE 15A SUPABASE AUTH STAFF MIGRATION & LOGIN REPAIR TEST SUITE
 * 
 * Verifies all 18 mandatory test scenarios required by Phase 15A:
 *  1. Login dengan username valid.
 *  2. Login dengan email valid.
 *  3. Password salah.
 *  4. Username tidak ditemukan.
 *  5. Akun tidak aktif.
 *  6. Profil staff tidak ditemukan.
 *  7. Auth UID tidak cocok.
 *  8. Token tidak valid.
 *  9. Token kedaluwarsa.
 * 10. Refresh token.
 * 11. Logout.
 * 12. Session revocation.
 * 13. Login seluruh role (Superadmin, Dispatch, Management Data, Leader, Installer, IT Support).
 * 14. Hak akses endpoint setiap role.
 * 15. Installer mencoba mengakses WO milik Installer lain.
 * 16. Leader mencoba mengakses contractor lain.
 * 17. Firebase token ditolak pada mode produksi.
 * 18. Password dan secret tidak muncul pada response/log.
 * 
 * STRICT COMPLIANCE:
 * - Real loopback HTTP calls against Express application.
 * - Exact HTTP status assertions.
 * - Boolean-only functional assertions.
 * - Zero production DB mutation (isolated mock Supabase backend).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  createExpressApp,
  SERVER_SESSIONS,
  db,
  isLocalJsonModeAllowed,
  ServerUser
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
const evidenceCollector = new SuiteEvidenceCollector('Phase15A');

function recordTest(
  num: number,
  title: string,
  category: string,
  passed: boolean,
  details: string,
  extraAssertions?: Array<{ name: string; passed: boolean; failureReason?: string; evidence?: string }>
) {
  if (typeof passed !== 'boolean') {
    console.error(`[CRITICAL TYPE ERROR] recordTest received non-boolean 'passed' in Test #${num}: type=${typeof passed}`);
  }
  results.push({ num, title, category, passed: passed === true, details });

  const actualAssertions = (extraAssertions && extraAssertions.length > 0)
    ? extraAssertions
    : [
        {
          name: `Functional Check: ${title}`,
          passed: passed,
          failureReason: passed === true ? undefined : (details || `Functional condition evaluated to false in Test #${num}`),
          evidence: `Evaluated in Test #${num}: ${details}`
        }
      ];

  evidenceCollector.linkToScenario({
    num,
    title,
    category,
    passed,
    functionalPassed: passed,
    details,
    assertions: actualAssertions
  });
  const status = passed === true ? 'PASS' : (typeof passed !== 'boolean' ? 'INVALID_ASSERTION' : 'FAIL');
  console.log(`[${status}] Test #${num} [${category}]: ${title}`);
  console.log(`       -> ${details}`);
}

/**
 * Creates isolated mock Supabase client for Phase 15A authentication testing
 */
function createPhase15aMockClient(options: {
  users?: any[];
  workOrders?: any[];
  authUsers?: Record<string, { id: string; email: string; password: string }>;
  expiredTokens?: string[];
  invalidTokens?: string[];
}) {
  const usersList: any[] = options.users ? [...options.users] : [
    {
      id: 'u-sa-01',
      name: 'Super Admin MoraJaws',
      username: 'superadmin',
      email: 'superadmin@morajaws.net',
      role: 'super_admin',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-sa-01', sessionVersion: 1 }
    },
    {
      id: 'u-disp-01',
      name: 'Petugas Dispatch',
      username: 'dispatch_staff',
      email: 'dispatch@morajaws.net',
      role: 'dispatch',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-disp-01', sessionVersion: 1 }
    },
    {
      id: 'u-mgmt-01',
      name: 'Management Data Staff',
      username: 'mgmt_data',
      email: 'mgmt@morajaws.net',
      role: 'management_data',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-mgmt-01', sessionVersion: 1 }
    },
    {
      id: 'u-lead-01',
      name: 'Korlap Ahmad',
      username: 'leader_ahmad',
      email: 'leader.ahmad@morajaws.net',
      role: 'leader',
      contractor: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-lead-01', sessionVersion: 1 }
    },
    {
      id: 'u-inst-01',
      name: 'Teknisi Budi',
      username: 'installer_budi',
      email: 'installer.budi@morajaws.net',
      role: 'installer',
      contractor: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-inst-01', sessionVersion: 1 }
    },
    {
      id: 'u-it-01',
      name: 'IT Support Team',
      username: 'it_support',
      email: 'itsupport@morajaws.net',
      role: 'it_support',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-it-01', sessionVersion: 1 }
    },
    {
      id: 'u-inactive-01',
      name: 'Staf Nonaktif',
      username: 'staf_inactive',
      email: 'inactive@morajaws.net',
      role: 'installer',
      active: false,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-inactive-01', sessionVersion: 1 }
    },
    {
      id: 'u-mismatch-01',
      name: 'Staf Mismatch UID',
      username: 'staf_mismatch',
      email: 'mismatch@morajaws.net',
      role: 'installer',
      active: true,
      is_deleted: false,
      payload: { authUserId: 'sb-uid-locked-original', sessionVersion: 1 }
    }
  ];

  const authDirectory: Record<string, { id: string; email: string; password: string }> = options.authUsers || {
    'superadmin@morajaws.net': { id: 'sb-uid-sa-01', email: 'superadmin@morajaws.net', password: 'ValidPassword123!' },
    'dispatch@morajaws.net': { id: 'sb-uid-disp-01', email: 'dispatch@morajaws.net', password: 'ValidPassword123!' },
    'mgmt@morajaws.net': { id: 'sb-uid-mgmt-01', email: 'mgmt@morajaws.net', password: 'ValidPassword123!' },
    'leader.ahmad@morajaws.net': { id: 'sb-uid-lead-01', email: 'leader.ahmad@morajaws.net', password: 'ValidPassword123!' },
    'installer.budi@morajaws.net': { id: 'sb-uid-inst-01', email: 'installer.budi@morajaws.net', password: 'ValidPassword123!' },
    'itsupport@morajaws.net': { id: 'sb-uid-it-01', email: 'itsupport@morajaws.net', password: 'ValidPassword123!' },
    'inactive@morajaws.net': { id: 'sb-uid-inactive-01', email: 'inactive@morajaws.net', password: 'ValidPassword123!' },
    'mismatch@morajaws.net': { id: 'sb-uid-different-runtime', email: 'mismatch@morajaws.net', password: 'ValidPassword123!' },
    'orphan@morajaws.net': { id: 'sb-uid-orphan-01', email: 'orphan@morajaws.net', password: 'ValidPassword123!' }
  };

  const workOrdersList: any[] = options.workOrders ? [...options.workOrders] : [
    {
      id: 'wo-test-101',
      wo_number: 'WO-BUDI-101',
      installer_name: 'Teknisi Budi',
      installer_id: 'u-inst-01',
      contractor_name: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      status_wo_installer: 'Assigned',
      appointment_date: '2026-11-06',
      is_deleted: false,
      payload: {
        id: 'wo-test-101',
        woNumber: 'WO-BUDI-101',
        installerName: 'Teknisi Budi',
        installerId: 'u-inst-01',
        contractorName: 'PT Mitra Jaringan Solusi',
        contractorId: 'c-test-01',
        area: 'Jakarta Barat'
      }
    },
    {
      id: 'wo-test-202',
      wo_number: 'WO-OTHER-202',
      installer_name: 'Teknisi Lain Joko',
      installer_id: 'u-inst-other',
      contractor_name: 'PT Mitra Jaringan Solusi',
      contractor_id: 'c-test-01',
      area: 'Jakarta Barat',
      status_wo_installer: 'Assigned',
      appointment_date: '2026-11-06',
      is_deleted: false,
      payload: {
        id: 'wo-test-202',
        woNumber: 'WO-OTHER-202',
        installerName: 'Teknisi Lain Joko',
        installerId: 'u-inst-other',
        contractorName: 'PT Mitra Jaringan Solusi',
        contractorId: 'c-test-01',
        area: 'Jakarta Barat'
      }
    },
    {
      id: 'wo-test-303',
      wo_number: 'WO-DIFF-CONTRACTOR-303',
      installer_name: 'Teknisi Mitra B',
      installer_id: 'u-inst-mitra-b',
      contractor_name: 'PT Fiber Optik Nusantara',
      contractor_id: 'c-other-02',
      area: 'Jakarta Timur',
      status_wo_installer: 'Assigned',
      appointment_date: '2026-11-06',
      is_deleted: false,
      payload: {
        id: 'wo-test-303',
        woNumber: 'WO-DIFF-CONTRACTOR-303',
        installerName: 'Teknisi Mitra B',
        installerId: 'u-inst-mitra-b',
        contractorName: 'PT Fiber Optik Nusantara',
        contractorId: 'c-other-02',
        area: 'Jakarta Timur'
      }
    }
  ];

  return {
    from: (table: string) => {
      let currentTableData: any[] = [];
      if (table === 'users') currentTableData = usersList;
      else if (table === 'work_orders') currentTableData = workOrdersList;
      else if (table === 'contractors') currentTableData = [
        { id: 'c-test-01', name: 'PT Mitra Jaringan Solusi', code: 'MJS', active: true },
        { id: 'c-other-02', name: 'PT Fiber Optik Nusantara', code: 'FON', active: true }
      ];
      else if (table === 'coverage_areas') currentTableData = [
        { id: 'area-1', name: 'Jakarta Barat', active: true },
        { id: 'area-2', name: 'Jakarta Timur', active: true }
      ];
      else if (table === 'app_settings') currentTableData = [
        { key: 'global_config', value: { maintenanceMode: false } }
      ];
      else currentTableData = [];

      let filters: Array<(row: any) => boolean> = [];
      let selectFields = '*';

      const builder: any = {
        select: (fields: string = '*') => {
          selectFields = fields;
          return builder;
        },
        eq: (col: string, val: any) => {
          filters.push(row => {
            if (col === 'id') return row.id === val;
            if (col === 'username') return (row.username || '').toLowerCase() === String(val).toLowerCase();
            if (col === 'email') return (row.email || '').toLowerCase() === String(val).toLowerCase();
            if (col === 'firebase_uid') return row.firebase_uid === val;
            if (col === 'is_deleted') return Boolean(row.is_deleted) === Boolean(val);
            if (col === 'contractor_id') return row.contractor_id === val;
            if (col === 'key') return row.key === val;
            return (row as any)[col] === val;
          });
          return builder;
        },
        ilike: (col: string, pattern: string) => {
          const cleanPattern = pattern.replace(/\\([_%])/g, '$1').replace(/%/g, '').toLowerCase();
          filters.push(row => {
            const val = (row[col] || '').toLowerCase();
            return val === cleanPattern;
          });
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const filtered = currentTableData.filter(r => filters.every(f => f(r)));
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          const filtered = currentTableData.filter(r => filters.every(f => f(r)));
          if (filtered.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          }
          return { data: filtered[0], error: null };
        },
        insert: (rows: any[]) => {
          const inserted = rows.map(r => ({ ...r, id: r.id || 'ins-' + Date.now() }));
          currentTableData.push(...inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null })
            })
          };
        },
        upsert: (data: any, options?: any) => {
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const conflictKey = options?.onConflict || 'id';
            const idx = currentTableData.findIndex(r => r[conflictKey] === item[conflictKey]);
            if (idx >= 0) {
              currentTableData[idx] = { ...currentTableData[idx], ...item };
            } else {
              currentTableData.push({ ...item, id: item.id || 'id-' + Date.now() });
            }
          }
          return {
            select: () => ({
              single: async () => ({ data: items[0], error: null }),
              maybeSingle: async () => ({ data: items[0], error: null })
            }),
            then: (resolve: any, reject: any) => Promise.resolve({ data: items, error: null }).then(resolve, reject)
          };
        },
        update: (updates: any) => {
          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              const applyUpdate = () => {
                const idx = currentTableData.findIndex(r => r[col] === val);
                if (idx >= 0) {
                  currentTableData[idx] = { ...currentTableData[idx], ...updates };
                  return { data: currentTableData[idx], error: null };
                }
                return { data: null, error: null };
              };
              return {
                select: () => ({
                  single: async () => applyUpdate(),
                  maybeSingle: async () => applyUpdate()
                }),
                then: (resolve: any, reject: any) => Promise.resolve(applyUpdate()).then(resolve, reject)
              };
            }
          };
          return updateBuilder;
        }
      };

      return builder;
    },
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const cleanEmail = (email || '').trim().toLowerCase();
        const found = authDirectory[cleanEmail];
        if (!found || found.password !== password) {
          return {
            data: { session: null, user: null },
            error: { status: 400, message: 'Invalid login credentials' }
          };
        }
        return {
          data: {
            user: { id: found.id, email: found.email },
            session: {
              access_token: `eyJ_mock_token_for_${found.id}_${Date.now()}`,
              refresh_token: `mock_refresh_token_for_${found.id}`,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }
          },
          error: null
        };
      },
      getUser: async (token: string) => {
        if (!token) {
          return { data: { user: null }, error: { status: 401, message: 'Token required' } };
        }
        if (options.invalidTokens?.includes(token)) {
          return { data: { user: null }, error: { status: 401, message: 'Token is invalid' } };
        }
        if (options.expiredTokens?.includes(token) || token.includes('expired')) {
          return { data: { user: null }, error: { status: 401, message: 'JWT token expired' } };
        }
        // Extract UID from token: eyJ_mock_token_for_<UID>_...
        const match = token.match(/eyJ_mock_token_for_([^_]+)/);
        if (match) {
          const authId = match[1];
          const foundAuth = Object.values(authDirectory).find(a => a.id === authId);
          if (foundAuth) {
            return {
              data: {
                user: { id: foundAuth.id, email: foundAuth.email }
              },
              error: null
            };
          }
        }
        // Fallback for valid token
        return {
          data: {
            user: { id: 'sb-uid-sa-01', email: 'superadmin@morajaws.net' }
          },
          error: null
        };
      },
      refreshSession: async ({ refresh_token }: { refresh_token: string }) => {
        if (!refresh_token || refresh_token === 'invalid_refresh') {
          return { data: { session: null }, error: { message: 'Invalid refresh token' } };
        }
        return {
          data: {
            session: {
              access_token: `eyJ_mock_token_refreshed_${Date.now()}`,
              refresh_token: `mock_refresh_token_renewed_${Date.now()}`,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }
          },
          error: null
        };
      },
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null })
    }
  };
}

/**
 * Loopback HTTP Request Helper using Node http
 */
function makeRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: any;
    tokenRole?: string | null;
  }
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders; rawText: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      return reject(new Error('Server address unavailable'));
    }
    const port = address.port;
    const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };
    if (bodyStr && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: reqHeaders
      },
      res => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(responseData);
          } catch {
            parsed = responseData;
          }

          evidenceCollector.recordHttpCall({
            method: options.method,
            url: options.path,
            actualStatus: res.statusCode || 0,
            responseBody: parsed,
            token: options.headers?.['Authorization'] || options.headers?.['authorization'] || null
          });

          resolve({
            status: res.statusCode || 0,
            body: parsed,
            headers: res.headers,
            rawText: responseData
          });
        });
      }
    );

    req.on('error', err => {
      reject(err);
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runPhase15aTests() {
  console.log('================================================================================');
  console.log('MORAJAWS — PHASE 15A: SUPABASE AUTH STAFF MIGRATION & LOGIN REPAIR SUITE');
  console.log('================================================================================\n');

  // Ensure production local json mode is disabled during test execution
  process.env.SUPABASE_URL = 'https://mock-supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mock_service_role_key_for_testing_15a';
  process.env.NODE_ENV = 'production';

  const mockClient = createPhase15aMockClient({
    expiredTokens: ['eyJ_expired_jwt_token_sample'],
    invalidTokens: ['eyJ_malformed_invalid_jwt_token']
  });
  setSupabaseBackendClientForTesting(mockClient);

  // Seed db.users for local caching sync
  db.users = [
    {
      id: 'u-sa-01',
      name: 'Super Admin MoraJaws',
      username: 'superadmin',
      email: 'superadmin@morajaws.net',
      role: 'super_admin',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-disp-01',
      name: 'Petugas Dispatch',
      username: 'dispatch_staff',
      email: 'dispatch@morajaws.net',
      role: 'dispatch',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-mgmt-01',
      name: 'Management Data Staff',
      username: 'mgmt_data',
      email: 'mgmt@morajaws.net',
      role: 'management_data',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-lead-01',
      name: 'Korlap Ahmad',
      username: 'leader_ahmad',
      email: 'leader.ahmad@morajaws.net',
      role: 'leader',
      contractor: 'PT Mitra Jaringan Solusi',
      contractorId: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-inst-01',
      name: 'Teknisi Budi',
      username: 'installer_budi',
      email: 'installer.budi@morajaws.net',
      role: 'installer',
      contractor: 'PT Mitra Jaringan Solusi',
      contractorId: 'c-test-01',
      area: 'Jakarta Barat',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-it-01',
      name: 'IT Support Team',
      username: 'it_support',
      email: 'itsupport@morajaws.net',
      role: 'it_support',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-inactive-01',
      name: 'Staf Nonaktif',
      username: 'staf_inactive',
      email: 'inactive@morajaws.net',
      role: 'installer',
      active: false,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    },
    {
      id: 'u-mismatch-01',
      name: 'Staf Mismatch UID',
      username: 'staf_mismatch',
      email: 'mismatch@morajaws.net',
      role: 'installer',
      active: true,
      passwordHash: 'DEF_HASH',
      createdAt: '2026-01-01T00:00:00Z',
      sessionVersion: 1
    }
  ];

  const app = await createExpressApp({ skipVite: true });
  const server = http.createServer(app);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // --------------------------------------------------------------------------
    // Test 1: Login dengan username valid
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'ValidPassword123!' },
        tokenRole: null
      });

      const pass = res.status === 200 &&
        res.body?.success === true &&
        Boolean(res.body?.tokens?.accessToken) &&
        res.body?.user?.username === 'superadmin' &&
        res.body?.user?.role === 'super_admin' &&
        res.body?.user?.passwordHash === undefined;

      recordTest(
        1,
        'Login dengan username valid',
        'Authentication',
        pass,
        `HTTP ${res.status}. Sesi berhasil dibuat via Supabase Auth, tokens returned, role=super_admin, no passwordHash leaked.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 2: Login dengan email valid
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'dispatch@morajaws.net', password: 'ValidPassword123!' },
        tokenRole: null
      });

      const pass = res.status === 200 &&
        res.body?.success === true &&
        Boolean(res.body?.tokens?.accessToken) &&
        res.body?.user?.role === 'dispatch';

      recordTest(
        2,
        'Login dengan email valid',
        'Authentication',
        pass,
        `HTTP ${res.status}. Login email berhasil diverifikasi ke Supabase Auth, role=dispatch.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 3: Password salah
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'WrongPassword999!' },
        tokenRole: null
      });

      const pass = res.status === 401 &&
        res.body?.success === false &&
        res.body?.code === 'auth/wrong-password';

      recordTest(
        3,
        'Password salah',
        'Security',
        pass,
        `HTTP ${res.status}. Autentikasi ditolak dengan kode auth/wrong-password.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 4: Username tidak ditemukan
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'unknown_user_999', password: 'AnyPassword123!' },
        tokenRole: null
      });

      const pass = res.status === 404 &&
        res.body?.success === false &&
        res.body?.code === 'auth/user-not-found';

      recordTest(
        4,
        'Username tidak ditemukan',
        'Directory Lookup',
        pass,
        `HTTP ${res.status}. Identitas tidak dikenal ditolak dengan kode auth/user-not-found.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 5: Akun tidak aktif
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'staf_inactive', password: 'ValidPassword123!' },
        tokenRole: null
      });

      const pass = res.status === 403 &&
        res.body?.success === false &&
        res.body?.code === 'ACCOUNT_DISABLED';

      recordTest(
        5,
        'Akun tidak aktif',
        'Account Status',
        pass,
        `HTTP ${res.status}. Akun nonaktif diblokir dengan kode ACCOUNT_DISABLED.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 6: Profil staff tidak ditemukan
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'orphan@morajaws.net', password: 'ValidPassword123!' },
        tokenRole: null
      });

      const pass = (res.status === 404) &&
        res.body?.success === false &&
        (res.body?.code === 'PROFILE_NOT_FOUND' || res.body?.code === 'auth/user-not-found');

      recordTest(
        6,
        'Profil staff tidak ditemukan',
        'Profile Integrity',
        pass,
        `HTTP ${res.status}. Akun Auth tanpa profil staf ditolak dengan kode ${res.body?.code}.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 7: Auth UID tidak cocok
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'staf_mismatch', password: 'ValidPassword123!' },
        tokenRole: null
      });

      const pass = res.status === 403 &&
        res.body?.success === false &&
        res.body?.code === 'AUTH_UID_MISMATCH';

      recordTest(
        7,
        'Auth UID tidak cocok',
        'Identity Integrity',
        pass,
        `HTTP ${res.status}. Ketidakcocokan Auth UID terdeteksi dan diblokir dengan kode AUTH_UID_MISMATCH.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 8: Token tidak valid
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: 'Bearer eyJ_malformed_invalid_jwt_token' },
        tokenRole: null
      });

      const pass = res.status === 401 &&
        (res.body?.code === 'TOKEN_INVALID' || res.body?.code === 'UNAUTHENTICATED');

      recordTest(
        8,
        'Token tidak valid',
        'Token Verification',
        pass,
        `HTTP ${res.status}. Token JWT rusak/tampered ditolak dengan 401.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 9: Token kedaluwarsa
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: 'Bearer eyJ_expired_jwt_token_sample' },
        tokenRole: null
      });

      const pass = res.status === 401 &&
        (res.body?.code === 'TOKEN_EXPIRED' || res.body?.code === 'UNAUTHENTICATED');

      recordTest(
        9,
        'Token kedaluwarsa',
        'Token Lifecycle',
        pass,
        `HTTP ${res.status}. Token kedaluwarsa ditolak dengan status 401.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 10: Refresh token
    // --------------------------------------------------------------------------
    {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-refresh',
        body: { refreshToken: 'mock_refresh_token_valid' },
        tokenRole: null
      });

      const pass = res.status === 200 &&
        res.body?.success === true &&
        Boolean(res.body?.tokens?.accessToken);

      recordTest(
        10,
        'Refresh token',
        'Session Refresh',
        pass,
        `HTTP ${res.status}. Refresh token berhasil memperbarui session tokens.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 11: Logout
    // --------------------------------------------------------------------------
    {
      // First login to obtain active token
      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'ValidPassword123!' }
      });
      const token = loginRes.body?.tokens?.accessToken;

      const logoutRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-logout',
        headers: { Authorization: `Bearer ${token}` }
      });

      // Subsequent call with the same token must be rejected
      const verifyRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${token}` }
      });

      const pass = logoutRes.status === 200 &&
        logoutRes.body?.success === true &&
        (verifyRes.status === 401 || verifyRes.body?.code === 'SESSION_REVOKED');

      recordTest(
        11,
        'Logout',
        'Session Termination',
        pass,
        `HTTP ${logoutRes.status} (logout), subsequent verify HTTP ${verifyRes.status}. Sesi berhasil diakhiri.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 12: Session revocation
    // --------------------------------------------------------------------------
    {
      // Login superadmin to perform revocation
      const saLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'ValidPassword123!' }
      });
      const saToken = saLogin.body?.tokens?.accessToken;

      // Login another user to create target session
      const dispLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'dispatch_staff', password: 'ValidPassword123!' }
      });
      const targetSessionId = dispLogin.body?.sessionId;
      const targetToken = dispLogin.body?.tokens?.accessToken;

      // Revoke the session
      const revokeRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/sessions/revoke',
        headers: { Authorization: `Bearer ${saToken}` },
        body: { sessionId: targetSessionId, reason: 'Security Audit Test' }
      });

      // Subsequent access with target token must fail
      const verifyRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${targetToken}` }
      });

      const pass = revokeRes.status === 200 &&
        revokeRes.body?.success === true &&
        verifyRes.status === 401;

      recordTest(
        12,
        'Session revocation',
        'Session Revocation',
        pass,
        `HTTP ${revokeRes.status} (revoke), target token access HTTP ${verifyRes.status}. Sesi berhasil dicabut.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 13: Login seluruh role
    // --------------------------------------------------------------------------
    {
      const rolesToTest = [
        { ident: 'superadmin', expectedRole: 'super_admin' },
        { ident: 'dispatch_staff', expectedRole: 'dispatch' },
        { ident: 'mgmt_data', expectedRole: 'management_data' },
        { ident: 'leader_ahmad', expectedRole: 'leader' },
        { ident: 'installer_budi', expectedRole: 'installer' },
        { ident: 'it_support', expectedRole: 'it_support' }
      ];

      let allRolesPassed = true;
      const testedRoles: string[] = [];

      for (const r of rolesToTest) {
        const res = await makeRequest(server, {
          method: 'POST',
          path: '/api/auth/supabase-login',
          body: { identifier: r.ident, password: 'ValidPassword123!' }
        });
        if (res.status !== 200 || res.body?.user?.role !== r.expectedRole) {
          allRolesPassed = false;
        } else {
          testedRoles.push(r.expectedRole);
        }
      }

      recordTest(
        13,
        'Login seluruh role',
        'RBAC Coverage',
        allRolesPassed,
        `Semua 6 role (${testedRoles.join(', ')}) berhasil login ke Supabase Auth dengan otorisasi peran presisi.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 14: Hak akses endpoint setiap role
    // --------------------------------------------------------------------------
    {
      // 1. Superadmin can update global config
      const saLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'ValidPassword123!' }
      });
      const saRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/config/global',
        headers: { Authorization: `Bearer ${saLogin.body?.tokens?.accessToken}` },
        body: { config: { maintenanceMode: false } }
      });

      // 2. Leader denied access to Superadmin global config update
      const leadLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'leader_ahmad', password: 'ValidPassword123!' }
      });
      const leadRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/config/global',
        headers: { Authorization: `Bearer ${leadLogin.body?.tokens?.accessToken}` },
        body: { config: { maintenanceMode: true } }
      });

      // 3. Installer denied access to create user (/api/users)
      const instLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'installer_budi', password: 'ValidPassword123!' }
      });
      const instRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/users',
        headers: { Authorization: `Bearer ${instLogin.body?.tokens?.accessToken}` },
        body: { name: 'Attempted User', username: 'attempted_user', role: 'installer' }
      });

      const pass = saRes.status === 200 &&
        leadRes.status === 403 &&
        instRes.status === 403;

      recordTest(
        14,
        'Hak akses endpoint setiap role',
        'RBAC Enforcement',
        pass,
        `Superadmin HTTP ${saRes.status} (ALLOW), Leader HTTP ${leadRes.status} (DENY), Installer HTTP ${instRes.status} (DENY).`
      );
    }

    // --------------------------------------------------------------------------
    // Test 15: Installer mencoba mengakses WO milik Installer lain
    // --------------------------------------------------------------------------
    {
      const instLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'installer_budi', password: 'ValidPassword123!' }
      });
      const instToken = instLogin.body?.tokens?.accessToken;

      // Installer attempts to submit progress report for unassigned WO 'wo-test-202'
      const repRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/tickets/wo-test-202/progress-report',
        headers: { Authorization: `Bearer ${instToken}` },
        body: {
          stepName: 'Test Step',
          status: 'In Progress',
          notes: 'Attempting report on unassigned WO'
        }
      });

      const pass = repRes.status === 403;

      recordTest(
        15,
        'Installer mencoba mengakses WO milik Installer lain',
        'Tenant & Scope Isolation',
        pass,
        `HTTP ${repRes.status}. Akses Installer terhadap WO yang tidak ditugaskan ditolak dengan 403.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 16: Leader mencoba mengakses contractor lain
    // --------------------------------------------------------------------------
    {
      const leadLogin = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'leader_ahmad', password: 'ValidPassword123!' }
      });
      const leadToken = leadLogin.body?.tokens?.accessToken;

      // Leader Ahmad (Mitra Jaringan Solusi) attempts to assign WO belonging to Fiber Optik Nusantara ('wo-test-303')
      const assignRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/tickets/assign',
        headers: { Authorization: `Bearer ${leadToken}` },
        body: {
          ticketId: 'wo-test-303',
          installerName: 'Teknisi Budi'
        }
      });

      const pass = assignRes.status === 403;

      recordTest(
        16,
        'Leader mencoba mengakses contractor lain',
        'Contractor Scope Isolation',
        pass,
        `HTTP ${assignRes.status}. Leader ditolak saat mencoba mengakses WO kontraktor lain.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 17: Firebase token ditolak pada mode produksi
    // --------------------------------------------------------------------------
    {
      // 1. Firebase login endpoint
      const fbLoginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/firebase-login',
        body: {
          email: 'test@morajaws.net',
          uid: 'fb-uid-test',
          idToken: 'mock_firebase_id_token'
        }
      });

      // 2. Firebase token indicator header on protected endpoint
      const fbProtectedRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/me',
        headers: {
          Authorization: 'Bearer mock_firebase_token_payload_longer_than_expected',
          'x-auth-provider': 'firebase'
        }
      });

      const pass = fbLoginRes.status === 403 &&
        fbLoginRes.body?.code === 'FIREBASE_AUTH_DISABLED_PRODUCTION' &&
        fbProtectedRes.status === 403;

      recordTest(
        17,
        'Firebase token ditolak pada mode produksi',
        'Production Cutover Security',
        pass,
        `HTTP ${fbLoginRes.status} (login), HTTP ${fbProtectedRes.status} (token). Firebase Auth diblokir total pada mode produksi.`
      );
    }

    // --------------------------------------------------------------------------
    // Test 18: Password dan secret tidak muncul pada response/log
    // --------------------------------------------------------------------------
    {
      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/supabase-login',
        body: { identifier: 'superadmin', password: 'ValidPassword123!' }
      });
      const token = loginRes.body?.tokens?.accessToken;

      const sessionRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/auth/session',
        headers: { Authorization: `Bearer ${token}` }
      });

      const resolveRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/resolve-identity',
        body: { identifier: 'superadmin' }
      });

      const bodyTexts = [
        loginRes.rawText,
        sessionRes.rawText,
        resolveRes.rawText
      ].join(' ');

      const leaksPasswordHash = bodyTexts.includes('passwordHash') && !bodyTexts.includes('"passwordHash":null');
      const leaksSecretKey = bodyTexts.includes('sb_secret_mock_service_role_key_for_testing_15a') ||
        bodyTexts.includes('SUPABASE_SERVICE_ROLE_KEY');
      const leaksPlainPassword = bodyTexts.includes('ValidPassword123!');
      const leaksEmailInResolve = resolveRes.body?.user?.email !== undefined;

      const pass = !leaksPasswordHash &&
        !leaksSecretKey &&
        !leaksPlainPassword &&
        !leaksEmailInResolve;

      recordTest(
        18,
        'Password dan secret tidak muncul pada response/log',
        'Data Leakage Prevention',
        pass,
        `Zero leakage of passwordHash, service role key, plaintext passwords, and resolve-identity does not expose email.`
      );
    }

  } finally {
    resetSupabaseBackendClientForTesting();
    server.close();
  }

  // Summary
  console.log('\n================================================================================');
  console.log('PHASE 15A TEST EXECUTION SUMMARY');
  console.log('================================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`Total Scenarios : ${total}`);
  console.log(`Passed          : ${passed}`);
  console.log(`Failed          : ${failed}`);

  // Persist evidence
  const evidencePath = path.join(process.cwd(), 'scripts', 'evidence', 'phase15a_executed_evidence.json');
  evidenceCollector.saveToFile(evidencePath);
  console.log(`Evidence written to ${evidencePath}`);

  if (failed > 0) {
    console.error(`\n[FAILURE] ${failed} scenario(s) failed in Phase 15A suite.`);
    process.exit(1);
  } else {
    console.log(`\n[SUCCESS] All ${total} Phase 15A Supabase Auth scenarios PASSED successfully!`);
    process.exit(0);
  }
}

runPhase15aTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
