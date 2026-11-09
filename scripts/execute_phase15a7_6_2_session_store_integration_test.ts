/**
 * MORAJAWS — PHASE 15A.7.6.2: REAL SESSION STORE INTEGRATION & LOGOUT FINALIZATION
 * 
 * HTTP-based test suite verifying:
 * 1. Login membuat session melalui ISessionStore.
 * 2. Session ditemukan melalui ISessionStore.
 * 3. Session expired ditolak.
 * 4. Refresh memakai cookie.
 * 5. Refresh bersamaan tidak membuat sesi ganda.
 * 6. Logout mencabut session melalui ISessionStore.
 * 7. Session setelah logout ditolak.
 * 8. Refresh setelah logout ditolak.
 * 9. Logout berulang aman.
 * 10. Kegagalan session store menghasilkan respons aman.
 * 11. Tidak ada endpoint yang mengakses SERVER_SESSIONS langsung.
 * 12. Redis tidak diklaim aktif ketika hanya stub.
 * 13. Frontend menggunakan satu alur logout.
 * 14. Cookie terhapus dengan benar.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  setAppEnvironmentForTesting,
  getSessionCookieName,
  STAGING_DEFAULT_SUPABASE_URL
} from '../server/environmentConfig.ts';

import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting
} from '../server/supabaseClient.ts';

import {
  createExpressApp
} from '../server.ts';

import {
  sessionStore,
  setSimulateStoreFailure,
  auditSessionStorageArchitecture,
  RedisSessionStoreStub
} from '../server/sessionStore.ts';

interface TestResult {
  num: number;
  title: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  details: string;
}

const results: TestResult[] = [];

function record(
  num: number,
  title: string,
  passed: boolean,
  details: string
) {
  const status: TestResult['status'] = passed ? 'PASS' : 'FAIL';
  results.push({ num, title, status, details });
  console.log(`[${status}] #${num} ${title}`);
  console.log(`       -> ${details}`);
}

const STAGING_TEST_PASSWORD = 'SecureStagingPassword2026!';
const STAGING_TEST_UID = '7e31d8c1-19d2-4467-8ab0-128216c0245a';

const mockStagingUsers: Record<string, any> = {
  'u_testing_installer': {
    id: 'u_testing_installer',
    name: 'Teknisi Testing Staging',
    username: 'teknisi_test_staging',
    email: 'installer.staging.test@morajaws.local',
    role: 'installer',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: false,
    sessionVersion: 1,
    authUserId: STAGING_TEST_UID
  }
};

function createMockSupabaseClient() {
  return {
    auth: {
      signInWithPassword: async (params: { email?: string; password?: string }) => {
        const { email, password } = params;
        if (!email || !password || password !== STAGING_TEST_PASSWORD) {
          return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid credentials' } };
        }
        const matched = Object.values(mockStagingUsers).find(
          u => u.email.toLowerCase() === email.toLowerCase()
        );
        if (!matched) {
          return { data: { user: null, session: null }, error: { code: 'user_not_found', message: 'User not found' } };
        }
        const authUid = matched.authUserId || 'fresh-auth-uid-1234';
        return {
          data: {
            user: { id: authUid, email: matched.email },
            session: {
              access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: authUid, email: matched.email, role: 'authenticated', amr: [{ method: 'password' }], ts: Date.now() })).toString('base64')}.simulated_staging_sig`,
              refresh_token: `staging_refresh_token_${matched.id}`,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }
          },
          error: null
        };
      },
      refreshSession: async (params: { refresh_token?: string }) => {
        if (!params.refresh_token || params.refresh_token === 'invalid_refresh_token') {
          return { data: { user: null, session: null }, error: { code: 'invalid_grant', message: 'Invalid Refresh Token' } };
        }
        return {
          data: {
            user: { id: STAGING_TEST_UID, email: 'installer.staging.test@morajaws.local' },
            session: {
              access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: STAGING_TEST_UID, email: 'installer.staging.test@morajaws.local', role: 'authenticated', amr: [{ method: 'password' }], ts: Date.now() })).toString('base64')}.refreshed_sig`,
              refresh_token: `refreshed_staging_refresh_token_${Date.now()}`,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }
          },
          error: null
        };
      },
      getUser: async (token: string) => {
        if (!token || !token.startsWith('eyJ')) {
          return { data: { user: null }, error: { message: 'Invalid JWT' } };
        }
        return {
          data: {
            user: {
              id: STAGING_TEST_UID,
              email: 'installer.staging.test@morajaws.local',
              role: 'authenticated'
            }
          },
          error: null
        };
      }
    },
    from: (table: string) => {
      const getTableData = () => {
        if (table === 'users') {
          return Object.values(mockStagingUsers).map((u: any) => ({
            ...u,
            auth_user_id: u.authUserId,
            is_deleted: u.is_deleted,
            payload: { authUserId: u.authUserId, sessionVersion: u.sessionVersion }
          }));
        }
        return [];
      };

      let filters: Array<(row: any) => boolean> = [];

      const builder: any = {
        select: (_fields: string = '*') => builder,
        eq: (col: string, val: any) => {
          filters.push(row => {
            if (col === 'id') return row.id === val;
            if (col === 'username') return (row.username || '').toLowerCase() === String(val).toLowerCase();
            if (col === 'email') return (row.email || '').toLowerCase() === String(val).toLowerCase();
            if (col === 'auth_user_id') return row.auth_user_id === val || row.authUserId === val;
            if (col === 'firebase_uid') return row.firebase_uid === val;
            if (col === 'is_deleted') return Boolean(row.is_deleted) === Boolean(val);
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
          const filtered = getTableData().filter(r => filters.every(f => f(r)));
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          const filtered = getTableData().filter(r => filters.every(f => f(r)));
          if (filtered.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          }
          return { data: filtered[0], error: null };
        },
        update: (updates: any) => {
          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              const applyUpdate = () => {
                const target = Object.values(mockStagingUsers).find((u: any) => u[col] === val || (col === 'id' && u.id === val));
                if (target) {
                  Object.assign(target, updates);
                  if (updates.payload && typeof updates.payload.sessionVersion === 'number') {
                    target.sessionVersion = updates.payload.sessionVersion;
                  }
                  if (typeof updates.sessionVersion === 'number') {
                    target.sessionVersion = updates.sessionVersion;
                  }
                  return { data: target, error: null };
                }
                return { data: null, error: { message: 'Row not found' } };
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
        },
        insert: (records: any) => ({
          select: () => ({
            single: async () => ({ data: records, error: null }),
            maybeSingle: async () => ({ data: records, error: null })
          }),
          then: (resolve: any) => Promise.resolve({ data: records, error: null }).then(resolve)
        })
      };

      return builder;
    }
  } as any;
}

function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let data: any = {};
          try {
            data = JSON.parse(raw);
          } catch {
            data = { rawText: raw };
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            data,
            rawBody: raw
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractCookieValue(setCookieHeaders: string[] | string | undefined, cookieName: string): string | null {
  if (!setCookieHeaders) return null;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const item of list) {
    const parts = item.split(';')[0].split('=');
    if (parts[0].trim() === cookieName) {
      return parts.slice(1).join('=').trim();
    }
  }
  return null;
}

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log('  MORAJAWS PHASE 15A.7.6.2 — REAL SESSION STORE & LOGOUT FINALIZATION TEST');
  console.log('='.repeat(80));

  setAppEnvironmentForTesting('staging');
  process.env.VITE_SUPABASE_URL = STAGING_DEFAULT_SUPABASE_URL;
  process.env.SUPABASE_URL = STAGING_DEFAULT_SUPABASE_URL;
  process.env.NODE_ENV = 'staging';

  setSupabaseBackendClientForTesting(createMockSupabaseClient());

  const app = await createExpressApp({ skipVite: true });
  const server = http.createServer(app);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const PORT = address.port;
  const cookieName = getSessionCookieName();

  let activeSessionId = '';
  let activeSessionCookie = '';

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Login membuat session melalui ISessionStore
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: LOGIN MEMBUAT SESSION MELALUI ISESSIONSTORE ---');
    const loginRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/supabase-login',
      {
        'Origin': 'https://ais-pre-morajaws-test.run.app',
        'X-Morajaws-Client': 'browser'
      },
      {
        identifier: 'teknisi_test_staging',
        password: STAGING_TEST_PASSWORD
      }
    );

    activeSessionId = loginRes.data.sessionId;
    const cookieHeader = loginRes.headers['set-cookie'];
    activeSessionCookie = extractCookieValue(cookieHeader, cookieName) || '';

    const sessionInStore = await sessionStore.findSession(activeSessionId);
    const pass1 =
      loginRes.status === 200 &&
      Boolean(activeSessionId) &&
      Boolean(activeSessionCookie) &&
      sessionInStore !== undefined &&
      sessionInStore.sessionId === activeSessionId &&
      sessionInStore.userId === 'u_testing_installer' &&
      sessionInStore.status === 'active';

    record(
      1,
      'Login membuat session melalui ISessionStore',
      pass1,
      `Status: ${loginRes.status}, SessionId: ${activeSessionId}, Store userId: ${sessionInStore?.userId}, status: ${sessionInStore?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Session ditemukan melalui ISessionStore
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: SESSION DITEMUKAN MELALUI ISESSIONSTORE ---');
    const sessionRes = await httpRequest(
      PORT,
      'GET',
      '/api/auth/session',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      }
    );

    const pass2 =
      sessionRes.status === 200 &&
      sessionRes.data.authenticated === true &&
      sessionRes.data.user?.id === 'u_testing_installer' &&
      sessionRes.data.session?.sessionId === activeSessionId;

    record(
      2,
      'Session ditemukan melalui ISessionStore',
      pass2,
      `Status: ${sessionRes.status}, authenticated: ${sessionRes.data.authenticated}, userId: ${sessionRes.data.user?.id}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Session expired ditolak
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: SESSION EXPIRED DITOLAK ---');
    // Set expiration to 10 minutes ago via ISessionStore
    await sessionStore.updateSession(activeSessionId, {
      expiresAt: new Date(Date.now() - 600000).toISOString()
    });

    const expiredSessionRes = await httpRequest(
      PORT,
      'GET',
      '/api/auth/session',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      }
    );

    const pass3 =
      expiredSessionRes.status === 200 &&
      expiredSessionRes.data.authenticated === false &&
      expiredSessionRes.data.user === null;

    record(
      3,
      'Session expired ditolak',
      pass3,
      `Status: ${expiredSessionRes.status}, authenticated: ${expiredSessionRes.data.authenticated}, user: ${expiredSessionRes.data.user}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Refresh memakai cookie
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: REFRESH MEMAKAI COOKIE ---');
    // Login fresh session
    const freshLoginRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/supabase-login',
      {
        'Origin': 'https://ais-pre-morajaws-test.run.app',
        'X-Morajaws-Client': 'browser'
      },
      {
        identifier: 'teknisi_test_staging',
        password: STAGING_TEST_PASSWORD
      }
    );
    activeSessionId = freshLoginRes.data.sessionId;
    activeSessionCookie = extractCookieValue(freshLoginRes.headers['set-cookie'], cookieName) || '';

    const refreshRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/supabase-refresh',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      },
      {}
    );

    const newRefreshedCookie = extractCookieValue(refreshRes.headers['set-cookie'], cookieName);
    const pass4 =
      refreshRes.status === 200 &&
      refreshRes.data.success === true &&
      refreshRes.data.tokens === undefined && // Zero tokens leaked to browser in body
      Boolean(newRefreshedCookie);

    if (newRefreshedCookie) {
      activeSessionCookie = newRefreshedCookie;
    }

    record(
      4,
      'Refresh memakai cookie',
      pass4,
      `Status: ${refreshRes.status}, success: ${refreshRes.data.success}, tokens in body: ${Boolean(refreshRes.data.tokens)}, new cookie: ${Boolean(newRefreshedCookie)}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Refresh bersamaan tidak membuat sesi ganda
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: REFRESH BERSAMAAN TIDAK MEMBUAT SESI GANDA ---');
    const [concurrent1, concurrent2] = await Promise.all([
      httpRequest(
        PORT,
        'POST',
        '/api/auth/supabase-refresh',
        {
          'Cookie': `${cookieName}=${activeSessionCookie}`,
          'X-Morajaws-Client': 'browser'
        },
        {}
      ),
      httpRequest(
        PORT,
        'POST',
        '/api/auth/supabase-refresh',
        {
          'Cookie': `${cookieName}=${activeSessionCookie}`,
          'X-Morajaws-Client': 'browser'
        },
        {}
      )
    ]);

    const activeUserSessions = await sessionStore.getActiveSessionsForUser('u_testing_installer');
    const pass5 =
      concurrent1.status === 200 &&
      concurrent2.status === 200 &&
      activeUserSessions.length === 1;

    record(
      5,
      'Refresh bersamaan tidak membuat sesi ganda',
      pass5,
      `Concurrent statuses: [${concurrent1.status}, ${concurrent2.status}], Active sessions count: ${activeUserSessions.length} (expected 1)`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Logout mencabut session melalui ISessionStore
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: LOGOUT MENCABUT SESSION MELALUI ISESSIONSTORE ---');
    const logoutRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/logout',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      }
    );

    const revokedSession = await sessionStore.findSession(activeSessionId, { allowInactive: true });
    const activeSearch = await sessionStore.findSession(activeSessionId);

    const pass6 =
      logoutRes.status === 200 &&
      logoutRes.data.success === true &&
      revokedSession?.status === 'revoked' &&
      activeSearch === undefined;

    record(
      6,
      'Logout mencabut session melalui ISessionStore',
      pass6,
      `Status: ${logoutRes.status}, Session status in store: ${revokedSession?.status}, Active lookup: ${activeSearch}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Session setelah logout ditolak
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: SESSION SETELAH LOGOUT DITOLAK ---');
    const postLogoutSessionRes = await httpRequest(
      PORT,
      'GET',
      '/api/auth/session',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      }
    );

    const pass7 =
      postLogoutSessionRes.data.authenticated === false ||
      postLogoutSessionRes.status === 401;

    record(
      7,
      'Session setelah logout ditolak',
      pass7,
      `Status: ${postLogoutSessionRes.status}, authenticated: ${postLogoutSessionRes.data.authenticated}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Refresh setelah logout ditolak
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: REFRESH SETELAH LOGOUT DITOLAK ---');
    const postLogoutRefreshRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/supabase-refresh',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      },
      {}
    );

    const pass8 =
      postLogoutRefreshRes.status === 401 &&
      postLogoutRefreshRes.data.code === 'SESSION_INVALID';

    record(
      8,
      'Refresh setelah logout ditolak',
      pass8,
      `Status: ${postLogoutRefreshRes.status}, Code: ${postLogoutRefreshRes.data.code}`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Logout berulang aman
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: LOGOUT BERULANG AMAN ---');
    const repeatLogoutRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/logout',
      {
        'Cookie': `${cookieName}=${activeSessionCookie}`,
        'X-Morajaws-Client': 'browser'
      }
    );

    const emptyLogoutRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/logout',
      {
        'X-Morajaws-Client': 'browser'
      }
    );

    const pass9 =
      repeatLogoutRes.status === 200 &&
      repeatLogoutRes.data.success === true &&
      emptyLogoutRes.status === 200 &&
      emptyLogoutRes.data.success === true;

    record(
      9,
      'Logout berulang aman',
      pass9,
      `Repeat logout status: ${repeatLogoutRes.status}, Empty logout status: ${emptyLogoutRes.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 10: Kegagalan session store menghasilkan respons aman
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: KEGAGALAN SESSION STORE MENGHASILKAN RESPONS AMAN ---');
    setSimulateStoreFailure(true);

    const storeFailLoginRes = await httpRequest(
      PORT,
      'POST',
      '/api/auth/supabase-login',
      {
        'Origin': 'https://ais-pre-morajaws-test.run.app',
        'X-Morajaws-Client': 'browser'
      },
      {
        identifier: 'teknisi_test_staging',
        password: STAGING_TEST_PASSWORD
      }
    );

    const storeFailSessionRes = await httpRequest(
      PORT,
      'GET',
      '/api/auth/session',
      {
        'Cookie': `${cookieName}=any_token_string`,
        'X-Morajaws-Client': 'browser'
      }
    );

    setSimulateStoreFailure(false);

    const pass10 =
      storeFailLoginRes.status === 500 &&
      storeFailLoginRes.data.code === 'SESSION_STORE_ERROR' &&
      storeFailSessionRes.status === 503 &&
      storeFailSessionRes.data.code === 'SESSION_STORE_UNAVAILABLE';

    record(
      10,
      'Kegagalan session store menghasilkan respons aman',
      pass10,
      `Login fail: ${storeFailLoginRes.status} (${storeFailLoginRes.data.code}), Session fail: ${storeFailSessionRes.status} (${storeFailSessionRes.data.code})`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Tidak ada endpoint yang mengakses SERVER_SESSIONS langsung
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: TIDAK ADA ENDPOINT YANG MENGAKSES SERVER_SESSIONS LANGSUNG ---');
    const serverTsPath = path.resolve(process.cwd(), 'server.ts');
    const serverTsContent = fs.readFileSync(serverTsPath, 'utf8');

    // Remove import/export statements before checking endpoint body accesses
    const lines = serverTsContent.split('\n');
    const nonImportLines = lines.filter(l =>
      !l.trim().startsWith('import ') &&
      !l.trim().startsWith('export { sessionStore') &&
      !l.trim().startsWith('export type {')
    );

    const directAccesses = nonImportLines.filter(l =>
      /SERVER_SESSIONS\.(find|unshift|filter|forEach|map|push|splice|length)/.test(l)
    );

    const pass11 = directAccesses.length === 0;

    record(
      11,
      'Tidak ada endpoint yang mengakses SERVER_SESSIONS langsung',
      pass11,
      `Direct accesses found in endpoints: ${directAccesses.length}`
    );

    // -------------------------------------------------------------------------
    // TEST 12: Redis tidak diklaim aktif ketika hanya stub
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: REDIS TIDAK DIKLAIM AKTIF KETIKA HANYA STUB ---');
    const archAudit = auditSessionStorageArchitecture();
    const redisStub = new RedisSessionStoreStub();
    let redisFailsClosed = false;
    try {
      await redisStub.findSession('any');
    } catch (e: any) {
      redisFailsClosed = e.message.includes('REDIS_UNAVAILABLE');
    }

    const pass12 =
      archAudit.storeType === 'memory' &&
      archAudit.multiInstanceSupported === false &&
      archAudit.sharedStorageAvailable === false &&
      redisStub.isSharedStore() === false &&
      redisFailsClosed === true;

    record(
      12,
      'Redis tidak diklaim aktif ketika hanya stub',
      pass12,
      `Store: ${archAudit.storeType}, Multi-instance: ${archAudit.multiInstanceSupported}, Shared storage: ${archAudit.sharedStorageAvailable}, Stub shared: ${redisStub.isSharedStore()}, Fails closed: ${redisFailsClosed}`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Frontend menggunakan satu alur logout
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: FRONTEND MENGGUNAKAN SATU ALUR LOGOUT ---');
    const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
    const authServicePath = path.resolve(process.cwd(), 'src/services/authService.ts');

    const appContextContent = fs.readFileSync(appContextPath, 'utf8');
    const authServiceContent = fs.readFileSync(authServicePath, 'utf8');

    const appCallsSupabaseLogout = appContextContent.includes("fetch('/api/auth/supabase-logout'");
    const appCallsLogout = appContextContent.includes("fetch('/api/auth/logout'");
    const authServiceCallsLogout = authServiceContent.includes("fetch('/api/auth/logout'");

    // AppContext must only call ONE logout endpoint, not both
    const pass13 =
      !appCallsSupabaseLogout &&
      appCallsLogout &&
      authServiceCallsLogout;

    record(
      13,
      'Frontend menggunakan satu alur logout',
      pass13,
      `AppContext calls /api/auth/logout: ${appCallsLogout}, calls supabase-logout: ${appCallsSupabaseLogout}, authService calls /api/auth/logout: ${authServiceCallsLogout}`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Cookie terhapus dengan benar
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 14: COOKIE TERHAPUS DENGAN BENAR ---');
    const setCookieHeaders = logoutRes.headers['set-cookie'];
    let cookieClearedCorrectly = false;
    if (setCookieHeaders) {
      const cookieStr = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : setCookieHeaders;
      cookieClearedCorrectly =
        cookieStr.includes(cookieName) &&
        (cookieStr.toLowerCase().includes('max-age=0') || cookieStr.toLowerCase().includes('expires=thu, 01 jan 1970')) &&
        cookieStr.toLowerCase().includes('path=/') &&
        cookieStr.toLowerCase().includes('httponly');
    }

    const pass14 = cookieClearedCorrectly;

    record(
      14,
      'Cookie terhapus dengan benar',
      pass14,
      `Cookie name matched: true, Max-Age/Expires zeroed: ${cookieClearedCorrectly}, HttpOnly & Path=/ verified`
    );

  } finally {
    server.close();
    resetSupabaseBackendClientForTesting();
  }

  console.log('\n' + '='.repeat(80));
  console.log('       PHASE 15A.7.6.2 TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL SCENARIOS : ${results.length}`);
  console.log(`PASS            : ${passCount}`);
  console.log(`FAIL            : ${failCount}`);
  console.log('='.repeat(80));

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
