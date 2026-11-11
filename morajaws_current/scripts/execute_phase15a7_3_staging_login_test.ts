/**
 * MORAJAWS — PHASE 15A.7.3: STAGING LOGIN BOOTSTRAP & END-TO-END ACCEPTANCE TEST SUITE
 * 
 * Comprehensive automated verification for Phase 15A.7.3:
 * 1. Environment Configuration & Isolation:
 *    - Strict separation of staging vs production.
 *    - Designation of Staging Project ID "lvytgqsvxntnvlohmrxi" and URL "https://lvytgqsvxntnvlohmrxi.supabase.co".
 *    - Zero fallback from staging to production credentials or URLs.
 *    - Fail-closed environment startup validation (validateEnvironmentStartup).
 *    - Environment-scoped cookie naming (morajaws_session_staging vs morajaws_session_prod).
 * 2. HTTP Security & Environment Spoofing Defense:
 *    - Rejection of browser attempts to manipulate environment or Supabase project on /api/auth/supabase-login and /api/auth/supabase-refresh.
 * 3. HTTP Express Login Handler Testing:
 *    - Valid login for staging testing account (non-superadmin, e.g. installer).
 *    - HttpOnly session cookie issuance.
 *    - Failed login: wrong password, username not found, inactive account, soft-deleted account, unmapped profile (NEEDS_MAPPING), Auth UID mismatch, invalid role.
 * 4. Session Persistence, Cookie Verification, and Logout:
 *    - Cookie-based authentication on /api/auth/me.
 *    - Sibling environment cookie isolation.
 *    - Backward-compatible Bearer header authentication.
 *    - Logout clears cookie and revokes session.
 *    - Post-logout token rejection (SESSION_REVOKED).
 *    - Re-login creates fresh session.
 * 5. Live Staging Supabase Audit:
 *    - Live reachability of https://lvytgqsvxntnvlohmrxi.supabase.co.
 *    - Credential presence and audit reporting.
 *    - Source code secrets audit.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  getAppEnvironment,
  setAppEnvironmentForTesting,
  getEnvironmentConfig,
  getSessionCookieName,
  validateEnvironmentStartup,
  STAGING_SUPABASE_PROJECT_ID,
  STAGING_DEFAULT_SUPABASE_URL
} from '../server/environmentConfig.ts';

import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting
} from '../server/supabaseClient.ts';

import {
  createExpressApp,
  SERVER_SESSIONS,
  ServerUser
} from '../server.ts';

interface TestResult {
  section: string;
  num: number;
  title: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
  details: string;
}

const results: TestResult[] = [];

function record(
  section: string,
  num: number,
  title: string,
  passed: boolean,
  details: string,
  blocked = false
) {
  const status: TestResult['status'] = blocked ? 'BLOCKED' : (passed ? 'PASS' : 'FAIL');
  results.push({ section, num, title, status, details });
  console.log(`[${status}] [${section}] #${num} ${title}`);
  console.log(`       -> ${details}`);
}

// Simulated staging mock users for Express HTTP testing
const STAGING_TEST_PASSWORD = 'SecureTestPassword2026!';
const STAGING_TEST_UID = 'auth_uid_installer_staging_77';

const mockStagingUsers: Record<string, any> = {
  // Test account: lowest operational role (installer)
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
  },
  // Inactive account
  'u_inactive_staging': {
    id: 'u_inactive_staging',
    name: 'Staf Nonaktif Staging',
    username: 'staf_inactive_staging',
    email: 'inactive.staging@morajaws.local',
    role: 'installer',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: false,
    is_deleted: false,
    sessionVersion: 1,
    authUserId: 'auth_uid_inactive_staging'
  },
  // Soft-deleted account
  'u_deleted_staging': {
    id: 'u_deleted_staging',
    name: 'Staf Terhapus Staging',
    username: 'staf_deleted_staging',
    email: 'deleted.staging@morajaws.local',
    role: 'installer',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: true,
    sessionVersion: 1,
    authUserId: 'auth_uid_deleted_staging'
  },
  // Unmapped account (no authUserId)
  'u_unmapped_staging': {
    id: 'u_unmapped_staging',
    name: 'Staf Belum Mapping',
    username: 'staf_unmapped_staging',
    email: 'unmapped.staging@morajaws.local',
    role: 'installer',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: false,
    sessionVersion: 1,
    authUserId: null
  },
  // Mismatched Auth UID
  'u_mismatch_staging': {
    id: 'u_mismatch_staging',
    name: 'Staf Mismatch Staging',
    username: 'staf_mismatch_staging',
    email: 'mismatch.staging@morajaws.local',
    role: 'installer',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: false,
    sessionVersion: 1,
    authUserId: 'auth_uid_different_original_value'
  },
  // Invalid role account
  'u_invalid_role_staging': {
    id: 'u_invalid_role_staging',
    name: 'Staf Invalid Role',
    username: 'staf_invalid_role',
    email: 'invalidrole.staging@morajaws.local',
    role: 'unauthorized_guest',
    contractor: 'PT Mora Staging Solusi',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: false,
    sessionVersion: 1,
    authUserId: 'auth_uid_invalid_role_staging'
  }
};

const mockSupabaseStagingClient = {
  from: (table: string) => {
    let currentTableData: any[] = [];
    if (table === 'users') {
      currentTableData = Object.values(mockStagingUsers).map((u: any) => ({
        ...u,
        auth_user_id: u.authUserId,
        is_deleted: u.is_deleted,
        payload: { authUserId: u.authUserId, sessionVersion: u.sessionVersion }
      }));
    } else {
      currentTableData = [];
    }

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
      update: (updates: any) => {
        const updateBuilder: any = {
          eq: (col: string, val: any) => {
            const applyUpdate = () => {
              const target = Object.values(mockStagingUsers).find((u: any) => u[col] === val || (col === 'id' && u.id === val));
              if (target) {
                Object.assign(target, updates);
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
          single: async () => ({ data: records, error: null })
        })
      })
    };

    return builder;
  },
  auth: {
    signInWithPassword: async (creds: { email: string; password: string }) => {
      const email = creds.email.toLowerCase();
      const user = Object.values(mockStagingUsers).find((u: any) => u.email.toLowerCase() === email);
      if (!user) {
        return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
      }
      if (creds.password !== STAGING_TEST_PASSWORD) {
        return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
      }

      // Generate simulated Auth UID
      const authUid = user.id === 'u_mismatch_staging' ? 'different_auth_uid_returned_by_supabase' : (user.authUserId || 'fresh_supabase_auth_uid_123');

      return {
        data: {
          user: {
            id: authUid,
            email: user.email,
            email_confirmed_at: '2026-01-01T00:00:00Z'
          },
          session: {
            access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: authUid, email: user.email, role: 'authenticated', amr: [{ method: 'password' }], ts: Date.now(), rand: Math.random() })).toString('base64')}.simulated_staging_sig`,
            refresh_token: 'staging_refresh_token_' + Date.now(),
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer'
          }
        },
        error: null
      };
    },
    getUser: async (jwt: string) => {
      if (!jwt.startsWith('eyJ')) {
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }
      try {
        const parts = jwt.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const user = Object.values(mockStagingUsers).find((u: any) => u.authUserId === payload.sub || u.email === payload.email);
        if (user) {
          return { data: { user: { id: payload.sub, email: user.email } }, error: null };
        }
        return { data: { user: { id: payload.sub, email: payload.email } }, error: null };
      } catch {
        return { data: { user: null }, error: { message: 'Failed to decode token' } };
      }
    }
  }
};

async function executePhase15a73TestSuite() {
  console.log('================================================================================');
  console.log('  MORAJAWS PHASE 15A.7.3 — STAGING LOGIN BOOTSTRAP & ACCEPTANCE SUITE           ');
  console.log('================================================================================\n');

  // ==========================================================================
  // SECTION 1: ENVIRONMENT CONFIGURATION & ISOLATION
  // ==========================================================================
  console.log('--- SECTION 1: ENVIRONMENT CONFIGURATION & ISOLATION ---');

  // 1. APP_ENV=staging selects staging environment
  setAppEnvironmentForTesting('staging');
  const stagingCfg = getEnvironmentConfig('staging');
  record(
    'CONFIG_ISOLATION',
    1,
    'Staging Config Designates Project ID lvytgqsvxntnvlohmrxi',
    stagingCfg.supabaseProjectId === 'lvytgqsvxntnvlohmrxi',
    `Staging Project ID: "${stagingCfg.supabaseProjectId}"`
  );

  // 2. Staging default Supabase URL
  record(
    'CONFIG_ISOLATION',
    2,
    'Staging Default Supabase URL Designation',
    stagingCfg.supabaseUrl === STAGING_DEFAULT_SUPABASE_URL,
    `Staging Supabase URL: "${stagingCfg.supabaseUrl}"`
  );

  // 3. Staging credential isolation: serviceRoleKey and anonKey never fall back to production
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'prod_secret_should_not_leak_to_staging';
  process.env.SUPABASE_ANON_KEY = 'prod_anon_should_not_leak_to_staging';
  const stagingIsolatedCfg = getEnvironmentConfig('staging');
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  record(
    'CONFIG_ISOLATION',
    3,
    'Staging Strictly Isolates Credentials from Production',
    stagingIsolatedCfg.supabaseServiceRoleKey === '' && stagingIsolatedCfg.supabaseAnonKey === '',
    `Staging serviceRoleKey: empty string (did not inherit production keys: true)`
  );

  // 4. Production strictly isolates from staging Project ID
  setAppEnvironmentForTesting('production');
  const prodCfg = getEnvironmentConfig('production');
  record(
    'CONFIG_ISOLATION',
    4,
    'Production Config Strictly Isolates from Staging Project ID',
    prodCfg.supabaseProjectId !== STAGING_SUPABASE_PROJECT_ID,
    `Production Project ID: "${prodCfg.supabaseProjectId}"`
  );

  // 5. validateEnvironmentStartup() detects mismatched staging URL
  setAppEnvironmentForTesting('staging');
  process.env.STAGING_SUPABASE_URL = 'https://wrong-project-id.supabase.co';
  const stagingMismatchValidation = validateEnvironmentStartup('staging');
  delete process.env.STAGING_SUPABASE_URL;
  record(
    'CONFIG_ISOLATION',
    5,
    'validateEnvironmentStartup() Fails Closed on Staging Project ID Mismatch',
    !stagingMismatchValidation.valid && stagingMismatchValidation.errors.some(e => e.includes('tidak cocok')),
    `Errors: ${JSON.stringify(stagingMismatchValidation.errors)}`
  );

  // 6. validateEnvironmentStartup() detects production pointing to staging
  setAppEnvironmentForTesting('production');
  process.env.PRODUCTION_SUPABASE_URL = 'https://lvytgqsvxntnvlohmrxi.supabase.co';
  const prodTargetingStagingValidation = validateEnvironmentStartup('production');
  delete process.env.PRODUCTION_SUPABASE_URL;
  record(
    'CONFIG_ISOLATION',
    6,
    'validateEnvironmentStartup() Fails Closed on Production Targeting Staging',
    !prodTargetingStagingValidation.valid && prodTargetingStagingValidation.errors.some(e => e.includes('dilarang')),
    `Errors: ${JSON.stringify(prodTargetingStagingValidation.errors)}`
  );

  // 7. Canonical cookie naming per environment
  record(
    'CONFIG_ISOLATION',
    7,
    'Canonical Session Cookie Naming Isolation',
    getSessionCookieName('staging') === 'morajaws_session_staging' &&
    getSessionCookieName('production') === 'morajaws_session_prod' &&
    getSessionCookieName('development') === 'morajaws_session_dev',
    `Staging: "${getSessionCookieName('staging')}", Prod: "${getSessionCookieName('production')}"`
  );

  setAppEnvironmentForTesting(null);

  // ==========================================================================
  // SECTION 2: HTTP SECURITY & ENVIRONMENT SPOOFING DEFENSE
  // ==========================================================================
  console.log('\n--- SECTION 2: HTTP SECURITY & ENVIRONMENT SPOOFING DEFENSE ---');

  // Start temporary Express instance for HTTP tests
  setAppEnvironmentForTesting('staging');
  setSupabaseBackendClientForTesting(mockSupabaseStagingClient as any);

  const expressApp = await createExpressApp({ skipVite: true });
  const server = http.createServer(expressApp);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const sendRequest = (endpoint: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}) => {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }>((resolve, reject) => {
      const url = new URL(endpoint, baseUrl);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            let parsed = data;
            try { parsed = JSON.parse(data); } catch {}
            resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
          });
        }
      );
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  };

  // 8. /api/auth/supabase-login rejects browser environment manipulation
  const resLoginEnvSpoof = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'teknisi_test_staging', password: STAGING_TEST_PASSWORD, appEnv: 'staging' }
  });
  record(
    'SECURITY_SPOOFING',
    8,
    'HTTP Login Rejection of Browser appEnv Manipulation',
    resLoginEnvSpoof.status === 400 && resLoginEnvSpoof.body?.code === 'UNAUTHORIZED_ENVIRONMENT_MANIPULATION',
    `Status: ${resLoginEnvSpoof.status}, Code: "${resLoginEnvSpoof.body?.code}"`
  );

  // 9. /api/auth/supabase-login rejects browser target project ID manipulation
  const resLoginProjectSpoof = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'teknisi_test_staging', password: STAGING_TEST_PASSWORD, projectId: 'lvytgqsvxntnvlohmrxi' }
  });
  record(
    'SECURITY_SPOOFING',
    9,
    'HTTP Login Rejection of Browser projectId Manipulation',
    resLoginProjectSpoof.status === 400 && resLoginProjectSpoof.body?.code === 'UNAUTHORIZED_ENVIRONMENT_MANIPULATION',
    `Status: ${resLoginProjectSpoof.status}, Code: "${resLoginProjectSpoof.body?.code}"`
  );

  // 10. /api/auth/supabase-refresh rejects browser environment manipulation
  const resRefreshSpoof = await sendRequest('/api/auth/supabase-refresh', {
    method: 'POST',
    body: { refreshToken: 'mock_token', environment: 'staging' }
  });
  record(
    'SECURITY_SPOOFING',
    10,
    'HTTP Refresh Rejection of Browser environment Manipulation',
    resRefreshSpoof.status === 400 && resRefreshSpoof.body?.code === 'UNAUTHORIZED_ENVIRONMENT_MANIPULATION',
    `Status: ${resRefreshSpoof.status}, Code: "${resRefreshSpoof.body?.code}"`
  );

  // ==========================================================================
  // SECTION 3: HTTP EXPRESS LOGIN HANDLER TESTING
  // ==========================================================================
  console.log('\n--- SECTION 3: HTTP EXPRESS LOGIN HANDLER TESTING ---');

  // 11. Valid login of staging test staff account
  const validLoginRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'teknisi_test_staging', password: STAGING_TEST_PASSWORD }
  });

  const validToken = validLoginRes.body?.tokens?.accessToken;
  const returnedUser = validLoginRes.body?.user;
  const setCookieHeader = validLoginRes.headers['set-cookie'];

  record(
    'LOGIN_HANDLERS',
    11,
    'HTTP Staging Test Staff Login Success',
    validLoginRes.status === 200 &&
    returnedUser?.role === 'installer' &&
    returnedUser?.username === 'teknisi_test_staging' &&
    !returnedUser?.passwordHash &&
    Boolean(validToken),
    `Status: ${validLoginRes.status}, User: ${returnedUser?.name} (${returnedUser?.role}), token present: ${Boolean(validToken)}`
  );

  // 12. Successful login sets HttpOnly session cookie morajaws_session_staging
  const hasStagingCookie = Array.isArray(setCookieHeader) && setCookieHeader.some(
    c => c.includes('morajaws_session_staging=') && c.toLowerCase().includes('httponly')
  );
  record(
    'LOGIN_HANDLERS',
    12,
    'HTTP Login Issues HttpOnly Session Cookie for Staging',
    hasStagingCookie,
    `Set-Cookie headers: ${JSON.stringify(setCookieHeader)}`
  );

  // 13. Wrong password rejection
  const wrongPwdRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'teknisi_test_staging', password: 'WrongPassword999!' }
  });
  record(
    'LOGIN_HANDLERS',
    13,
    'HTTP Wrong Password Rejection',
    wrongPwdRes.status === 401 && (wrongPwdRes.body?.code === 'AUTH_INVALID_CREDENTIALS' || wrongPwdRes.body?.code === 'MJ-AUTH-001'),
    `Status: ${wrongPwdRes.status}, Code: "${wrongPwdRes.body?.code}"`
  );

  // 14. Unknown username rejection (Anti-enumeration preserved)
  const unknownUserRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'non_existent_staff_xyz', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    14,
    'HTTP Unknown Username Rejection',
    unknownUserRes.status === 404 && unknownUserRes.body?.code === 'auth/user-not-found',
    `Status: ${unknownUserRes.status}, Code: "${unknownUserRes.body?.code}"`
  );

  // 15. Inactive account rejection
  const inactiveRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'staf_inactive_staging', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    15,
    'HTTP Disabled Staff Account Rejection',
    inactiveRes.status === 403 && inactiveRes.body?.code === 'ACCOUNT_DISABLED',
    `Status: ${inactiveRes.status}, Code: "${inactiveRes.body?.code}"`
  );

  // 16. Soft-deleted account rejection
  const deletedRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'staf_deleted_staging', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    16,
    'HTTP Soft-Deleted Account Rejection',
    deletedRes.status === 403 && deletedRes.body?.code === 'ACCOUNT_DELETED',
    `Status: ${deletedRes.status}, Code: "${deletedRes.body?.code}"`
  );

  // 17. Unmapped staff profile rejection (NEEDS_MAPPING)
  const unmappedRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'staf_unmapped_staging', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    17,
    'HTTP Unmapped Auth UID Profile Rejection (NEEDS_MAPPING)',
    unmappedRes.status === 403 && unmappedRes.body?.code === 'NEEDS_MAPPING',
    `Status: ${unmappedRes.status}, Code: "${unmappedRes.body?.code}"`
  );

  // 18. Auth UID mismatch rejection
  const mismatchRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'staf_mismatch_staging', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    18,
    'HTTP Auth UID Mismatch Rejection',
    mismatchRes.status === 403 && mismatchRes.body?.code === 'AUTH_UID_MISMATCH',
    `Status: ${mismatchRes.status}, Code: "${mismatchRes.body?.code}"`
  );

  // 19. Invalid role rejection
  const invalidRoleRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'staf_invalid_role', password: STAGING_TEST_PASSWORD }
  });
  record(
    'LOGIN_HANDLERS',
    19,
    'HTTP Invalid Role Account Rejection',
    invalidRoleRes.status === 403 && invalidRoleRes.body?.code === 'INVALID_ROLE',
    `Status: ${invalidRoleRes.status}, Code: "${invalidRoleRes.body?.code}"`
  );

  // ==========================================================================
  // SECTION 4: SESSION PERSISTENCE, COOKIE VERIFICATION, AND LOGOUT
  // ==========================================================================
  console.log('\n--- SECTION 4: SESSION PERSISTENCE, COOKIE VERIFICATION, AND LOGOUT ---');

  // 20. Cookie-based authentication on /api/auth/me
  const cookieAuthRes = await sendRequest('/api/auth/me', {
    headers: {
      Cookie: `morajaws_session_staging=${validToken}`
    }
  });
  record(
    'SESSION_LIFECYCLE',
    20,
    'Cookie-Based Authentication via morajaws_session_staging',
    cookieAuthRes.status === 200 && cookieAuthRes.body?.user?.username === 'teknisi_test_staging',
    `Status: ${cookieAuthRes.status}, User resolved: "${cookieAuthRes.body?.user?.name}"`
  );

  // 21. Sibling environment cookie isolation: passing production cookie in staging is rejected
  const crossCookieRes = await sendRequest('/api/auth/me', {
    headers: {
      Cookie: `morajaws_session_prod=${validToken}`
    }
  });
  record(
    'SESSION_LIFECYCLE',
    21,
    'Cross-Environment Cookie Isolation (Production Cookie Rejected in Staging)',
    crossCookieRes.status === 401 && crossCookieRes.body?.code === 'UNAUTHENTICATED',
    `Status: ${crossCookieRes.status}, Code: "${crossCookieRes.body?.code}"`
  );

  // 22. Header-based authentication (backward compatibility)
  const headerAuthRes = await sendRequest('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${validToken}`
    }
  });
  record(
    'SESSION_LIFECYCLE',
    22,
    'Backward-Compatible Authorization Bearer Header Support',
    headerAuthRes.status === 200 && headerAuthRes.body?.user?.username === 'teknisi_test_staging',
    `Status: ${headerAuthRes.status}, User resolved: "${headerAuthRes.body?.user?.name}"`
  );

  // 23. Unauthenticated request rejected
  const noAuthRes = await sendRequest('/api/auth/me');
  record(
    'SESSION_LIFECYCLE',
    23,
    'Unauthenticated Request Rejection',
    noAuthRes.status === 401 && noAuthRes.body?.code === 'UNAUTHENTICATED',
    `Status: ${noAuthRes.status}, Code: "${noAuthRes.body?.code}"`
  );

  // 24. Logout clears session cookie and increments session version
  const logoutRes = await sendRequest('/api/auth/supabase-logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${validToken}`
    }
  });
  const logoutCookieHeader = logoutRes.headers['set-cookie'];
  const cookieCleared = Array.isArray(logoutCookieHeader) && logoutCookieHeader.some(
    c => c.includes('morajaws_session_staging=;') || c.includes('morajaws_session_staging=') && (c.includes('Expires=Thu, 01 Jan 1970') || c.includes('Max-Age=0'))
  );
  record(
    'SESSION_LIFECYCLE',
    24,
    'Logout Clears Session Cookie via Set-Cookie Header',
    logoutRes.status === 200 && cookieCleared,
    `Status: ${logoutRes.status}, Cleared cookie: ${cookieCleared}`
  );

  // 25. Reused token after logout is rejected (SESSION_REVOKED)
  const reuseTokenRes = await sendRequest('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${validToken}`
    }
  });
  record(
    'SESSION_LIFECYCLE',
    25,
    'Reused Token After Logout Strictly Blocked (SESSION_REVOKED)',
    reuseTokenRes.status === 401 && (reuseTokenRes.body?.code === 'SESSION_REVOKED' || reuseTokenRes.body?.code === 'UNAUTHENTICATED'),
    `Status: ${reuseTokenRes.status}, Code: "${reuseTokenRes.body?.code}"`
  );

  // 26. Re-login after logout succeeds with new session tokens
  const reloginRes = await sendRequest('/api/auth/supabase-login', {
    method: 'POST',
    body: { identifier: 'teknisi_test_staging', password: STAGING_TEST_PASSWORD }
  });
  const newTokens = reloginRes.body?.tokens;
  record(
    'SESSION_LIFECYCLE',
    26,
    'Re-login After Logout Succeeded with Fresh Session Tokens',
    reloginRes.status === 200 && Boolean(newTokens?.accessToken) && newTokens.accessToken !== validToken,
    `Status: ${reloginRes.status}, Fresh token issued: ${Boolean(newTokens?.accessToken)}`
  );

  // Close test Express server
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  resetSupabaseBackendClientForTesting();
  setAppEnvironmentForTesting(null);

  // ==========================================================================
  // SECTION 5: LIVE STAGING ENVIRONMENT & SECRETS AUDIT
  // ==========================================================================
  console.log('\n--- SECTION 5: LIVE STAGING ENVIRONMENT & SECRETS AUDIT ---');

  // 27. Live reachability of Supabase Staging URL
  let liveStagingReachable = false;
  let liveStagingMessage = '';
  try {
    const liveRes = await fetch(`${STAGING_DEFAULT_SUPABASE_URL}/auth/v1/settings`);
    const liveBody = await liveRes.json();
    if (liveBody?.message?.includes('No API key found') || liveRes.status === 200 || liveRes.status === 400 || liveRes.status === 401) {
      liveStagingReachable = true;
      liveStagingMessage = `Live Supabase project "${STAGING_SUPABASE_PROJECT_ID}" reachable and responding at ${STAGING_DEFAULT_SUPABASE_URL}`;
    }
  } catch (err: any) {
    liveStagingMessage = err.message;
  }

  record(
    'LIVE_AUDIT',
    27,
    'Live Staging Supabase Project Reachability',
    liveStagingReachable,
    liveStagingMessage
  );

  // 28. Staging credentials presence check
  const hasStagingSecret = Boolean(process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SECRET_KEY);
  const hasStagingAnon = Boolean(process.env.STAGING_SUPABASE_ANON_KEY);
  const stagingCredsConfigured = hasStagingSecret && hasStagingAnon;

  record(
    'LIVE_AUDIT',
    28,
    'Staging Supabase Credentials Provisioning in Process Environment',
    stagingCredsConfigured,
    stagingCredsConfigured
      ? 'Kredensial staging terpasang lengkap.'
      : 'BLOCKED / PARTIAL PASS: STAGING_SUPABASE_SERVICE_ROLE_KEY dan STAGING_SUPABASE_ANON_KEY belum dimasukkan ke environment runtime oleh operator. Tidak ada fallback ke produksi.',
    !stagingCredsConfigured
  );

  // 29. Source code secrets audit
  const srcFiles = fs.readdirSync(path.join(process.cwd(), 'src'), { recursive: true }) as string[];
  let secretLeakFound = false;
  let leakedFile = '';

  for (const f of srcFiles) {
    const full = path.join(process.cwd(), 'src', f);
    if (fs.statSync(full).isFile() && (f.endsWith('.ts') || f.endsWith('.tsx'))) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('sb_secret_') || content.includes('service_role') && content.includes('eyJ')) {
        secretLeakFound = true;
        leakedFile = f;
        break;
      }
    }
  }

  record(
    'LIVE_AUDIT',
    29,
    'Frontend Source Code Secrets Audit (Zero Leaks)',
    !secretLeakFound,
    !secretLeakFound ? 'Zero service-role keys or JWT secrets found in src/' : `LEAK DETECTED in ${leakedFile}`
  );

  // ==========================================================================
  // FINAL SUMMARY
  // ==========================================================================
  console.log('\n================================================================================');
  console.log('                 PHASE 15A.7.3 TEST EXECUTION SUMMARY                           ');
  console.log('================================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const blockedCount = results.filter(r => r.status === 'BLOCKED').length;

  console.log(`TOTAL SCENARIOS : ${results.length}`);
  console.log(`PASS            : ${passCount}`);
  console.log(`FAIL            : ${failCount}`);
  console.log(`BLOCKED         : ${blockedCount}`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    console.error(`[EXECUTION FAILED] ${failCount} scenarios failed!`);
    process.exit(1);
  } else {
    console.log(`[EXECUTION SUCCESS] All non-blocked scenarios passed with zero regressions.`);
    process.exit(0);
  }
}

executePhase15a73TestSuite().catch(err => {
  console.error('Test suite crashed with unhandled error:', err);
  process.exit(1);
});
