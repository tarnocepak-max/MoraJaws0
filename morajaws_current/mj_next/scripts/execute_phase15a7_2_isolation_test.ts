/**
 * MORAJAWS PHASE 15A.7.2 — STAGING CALLBACK ISOLATION & RECOVERY PREPARATION TEST SUITE
 * 
 * Comprehensive test execution verifying:
 * - Environment configuration separation ('production' | 'staging' | 'development').
 * - Staging Supabase Project ID "lvytgqsvxntnvlohmrxi" designation.
 * - Staging callback isolation (BLOCKED until staging application domain is established).
 * - Cross-environment rejection (Staging cannot use production domain; Production cannot use staging callback).
 * - HTTP Express handler defense against browser environment/target project spoofing.
 * - Strict recovery proof binding, single-use, TTL, replay prevention, anti-enumeration.
 * - Multi-instance recovery store audit (BLOCKED/PARTIAL without Redis).
 * - Secrets audit across source code and .env.example.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  getAppEnvironment,
  setAppEnvironmentForTesting,
  getEnvironmentConfig,
  resolveAuthRedirectUrl,
  AuthRedirectConfigError,
  STAGING_SUPABASE_PROJECT_ID,
  STAGING_DEFAULT_SUPABASE_URL,
  PRODUCTION_DEFAULT_APP_BASE_URL,
  PRODUCTION_DEFAULT_CALLBACK_URL
} from '../server/environmentConfig.ts';
import {
  resetSupabaseAuthPassword,
  verifySupabaseRecoveryToken,
  updateSupabaseUserPassword,
  isLoginAccessToken,
  createRecoveryTransaction,
  getValidRecoveryTransaction,
  clearServerRecoveryStoreForTesting
} from '../server/supabaseAuthAdapter.ts';
import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting,
  getSupabaseBackendClient,
  isSupabaseConfigured
} from '../server/supabaseClient.ts';
import { createExpressApp, clearAllRecoveryRateLimitsForTesting } from '../server.ts';

interface TestCaseResult {
  category: 'CONFIG' | 'REDIRECT' | 'ADAPTER_ISOLATION' | 'HTTP_INTEGRATION' | 'STORE_AND_SECRETS';
  number: number;
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
  detail: string;
}

const testResults: TestCaseResult[] = [];

function record(
  category: 'CONFIG' | 'REDIRECT' | 'ADAPTER_ISOLATION' | 'HTTP_INTEGRATION' | 'STORE_AND_SECRETS',
  number: number,
  name: string,
  passed: boolean,
  detail: string
) {
  testResults.push({
    category,
    number,
    name,
    status: passed ? 'PASS' : 'FAIL',
    detail
  });
}

// Simulated Supabase Auth store for mock tests
const mockAuthUsers: Record<string, { email: string; passwordHash: string; active: boolean; isDeleted: boolean }> = {
  'uid_superadmin_01': {
    email: 'tarnocepak@gmail.com',
    passwordHash: 'old_superadmin_hash',
    active: true,
    isDeleted: false
  },
  'uid_technician_02': {
    email: 'technician@morajaws.com',
    passwordHash: 'old_technician_hash',
    active: true,
    isDeleted: false
  }
};

const consumedCodes = new Set<string>();
const consumedOtpHashes = new Set<string>();
let lastResetEmailRequested = '';
let lastRedirectToSent = '';

const mockSupabaseClient = {
  from: (table: string) => ({
    select: (fields?: string) => ({
      eq: (col: string, val: any) => {
        const findFn = async () => {
          const entry = Object.entries(mockAuthUsers).find(([uid, u]) => uid === val || u.email === val);
          if (entry) {
            return {
              data: {
                id: entry[0],
                email: entry[1].email,
                active: entry[1].active,
                isDeleted: entry[1].isDeleted,
                sessionVersion: 1
              },
              error: null
            };
          }
          return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        };
        return {
          single: findFn,
          maybeSingle: async () => {
            const res = await findFn();
            return { data: res.data, error: null };
          },
          limit: () => ({
            data: [],
            error: null,
            maybeSingle: async () => {
              const res = await findFn();
              return { data: res.data, error: null };
            }
          })
        };
      },
      limit: () => ({ data: [{ code: 'super_admin' }], error: null })
    })
  }),
  auth: {
    resetPasswordForEmail: async (email: string, options?: any) => {
      lastResetEmailRequested = email;
      lastRedirectToSent = options?.redirectTo;
      return { data: {}, error: null };
    },
    exchangeCodeForSession: async (code: string) => {
      if (consumedCodes.has(code)) {
        return { data: { user: null, session: null }, error: new Error('PKCE code already used') };
      }
      if (code === 'expired_pkce_code') {
        return { data: { user: null, session: null }, error: new Error('PKCE code has expired') };
      }
      if (code === 'valid_pkce_code_technician') {
        consumedCodes.add(code);
        return {
          data: {
            user: { id: 'uid_technician_02', email: 'technician@morajaws.com' },
            session: { access_token: 'rec_pkce_sess_tech_101', refresh_token: 'rf_101' }
          },
          error: null
        };
      }
      return { data: { user: null, session: null }, error: new Error('Invalid PKCE authorization code') };
    },
    verifyOtp: async (params: { token_hash: string; type: string }) => {
      const hash = params.token_hash;
      if (consumedOtpHashes.has(hash)) {
        return { data: { user: null, session: null }, error: new Error('OTP token hash already used') };
      }
      if (hash === 'expired_otp_hash') {
        return { data: { user: null, session: null }, error: new Error('Token hash has expired') };
      }
      if (hash === 'valid_otp_hash_technician') {
        consumedOtpHashes.add(hash);
        return {
          data: {
            user: { id: 'uid_technician_02', email: 'technician@morajaws.com' },
            session: { access_token: 'rec_otp_sess_tech_202', refresh_token: 'rf_202' }
          },
          error: null
        };
      }
      return { data: { user: null, session: null }, error: new Error('Invalid OTP token hash') };
    },
    getUser: async (token: string) => {
      if (token === 'regular_login_access_token') {
        return {
          data: { user: { id: 'uid_technician_02', email: 'technician@morajaws.com' } },
          error: null
        };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    },
    admin: {
      updateUserById: async (userId: string, attributes: { password?: string }) => {
        if (!mockAuthUsers[userId]) {
          return { data: null, error: new Error('User not found in Supabase Auth') };
        }
        if (attributes.password) {
          mockAuthUsers[userId].passwordHash = `HASHED_${attributes.password}`;
        }
        return {
          data: { user: { id: userId, email: mockAuthUsers[userId].email } },
          error: null
        };
      },
      signOut: async (_userId: string, _scope: string) => {
        return { data: null, error: null };
      }
    }
  }
};

async function runAllTests() {
  console.log('================================================================');
  console.log('  MORAJAWS PHASE 15A.7.2 — STAGING ISOLATION & AUDIT SUITE      ');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: ENVIRONMENT & CONFIGURATION TESTS
  // ==========================================================================
  console.log('--- SECTION 1: ENVIRONMENT & CONFIGURATION UNIT TESTS ---');

  // 1. Staging config designates Supabase Project ID "lvytgqsvxntnvlohmrxi"
  const stagingCfg = getEnvironmentConfig('staging');
  record(
    'CONFIG',
    1,
    'Staging Config Designates Project ID lvytgqsvxntnvlohmrxi',
    stagingCfg.supabaseProjectId === 'lvytgqsvxntnvlohmrxi',
    `Project ID resolved to: "${stagingCfg.supabaseProjectId}"`
  );

  // 2. Staging default Supabase URL is https://lvytgqsvxntnvlohmrxi.supabase.co
  record(
    'CONFIG',
    2,
    'Staging Default Supabase URL Designation',
    stagingCfg.supabaseUrl === 'https://lvytgqsvxntnvlohmrxi.supabase.co',
    `Staging Supabase URL resolved to: "${stagingCfg.supabaseUrl}"`
  );

  // 3. Staging callback marked BLOCKED when application staging domain is unconfigured
  record(
    'CONFIG',
    3,
    'Staging Callback Unconfigured Status (BLOCKED)',
    stagingCfg.isCallbackConfigured === false && Boolean(stagingCfg.callbackBlockedReason),
    `isCallbackConfigured: ${stagingCfg.isCallbackConfigured}, reason: "${stagingCfg.callbackBlockedReason}"`
  );

  // 4. Production config preserves canonical domain and callback
  const prodCfg = getEnvironmentConfig('production');
  record(
    'CONFIG',
    4,
    'Production Config Canonical Domain & Callback Enforcement',
    prodCfg.appBaseUrl === 'https://morajaws.ai.studio' &&
    prodCfg.recoveryCallbackUrl === 'https://morajaws.ai.studio/' &&
    prodCfg.allowedRedirectOrigins.includes('https://morajaws.ai.studio'),
    `Base URL: "${prodCfg.appBaseUrl}", Callback: "${prodCfg.recoveryCallbackUrl}"`
  );

  // 5. Production never selects staging Project ID
  record(
    'CONFIG',
    5,
    'Production Never Selects Staging Project ID',
    prodCfg.supabaseProjectId !== 'lvytgqsvxntnvlohmrxi',
    `Production Project ID: "${prodCfg.supabaseProjectId}" (strictly isolated from lvytgqsvxntnvlohmrxi)`
  );

  // 6. Development config supports localhost origins
  const devCfg = getEnvironmentConfig('development');
  record(
    'CONFIG',
    6,
    'Development Config Support for Localhost',
    devCfg.allowedRedirectOrigins.includes('http://localhost:3000'),
    `Development origins: ${JSON.stringify(devCfg.allowedRedirectOrigins)}`
  );

  // ==========================================================================
  // SECTION 2: REDIRECT ALLOWLIST & CROSS-ENVIRONMENT REJECTION
  // ==========================================================================
  console.log('\n--- SECTION 2: REDIRECT ALLOWLIST & CROSS-ENVIRONMENT REJECTION ---');

  // 7. resolveAuthRedirectUrl in staging without configured domain throws STAGING_CALLBACK_NOT_CONFIGURED (fail closed)
  let stagingUnconfiguredThrew = false;
  let stagingUnconfiguredCode = '';
  try {
    resolveAuthRedirectUrl(undefined, 'staging');
  } catch (err: any) {
    stagingUnconfiguredThrew = true;
    stagingUnconfiguredCode = err.code || err.message;
  }
  record(
    'REDIRECT',
    7,
    'Staging Unconfigured Callback Rejection (Fail Closed)',
    stagingUnconfiguredThrew && stagingUnconfiguredCode === 'STAGING_CALLBACK_NOT_CONFIGURED',
    `Threw AuthRedirectConfigError with code: "${stagingUnconfiguredCode}"`
  );

  // 8. Staging strictly rejects production domain "https://morajaws.ai.studio"
  let crossEnvStagingThrew = false;
  let crossEnvStagingCode = '';
  try {
    // Temporarily simulate staging domain configured via environment variable
    process.env.STAGING_APP_BASE_URL = 'https://mora-auth-staging.internal.app';
    process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL = 'https://mora-auth-staging.internal.app/auth/callback';
    process.env.STAGING_ALLOWED_REDIRECT_ORIGINS = 'https://mora-auth-staging.internal.app';

    resolveAuthRedirectUrl('https://morajaws.ai.studio/', 'staging');
  } catch (err: any) {
    crossEnvStagingThrew = true;
    crossEnvStagingCode = err.code || err.message;
  } finally {
    delete process.env.STAGING_APP_BASE_URL;
    delete process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL;
    delete process.env.STAGING_ALLOWED_REDIRECT_ORIGINS;
  }
  record(
    'REDIRECT',
    8,
    'Staging Rejection of Production Domain (CROSS_ENVIRONMENT_REDIRECT_REJECTED)',
    crossEnvStagingThrew && crossEnvStagingCode === 'CROSS_ENVIRONMENT_REDIRECT_REJECTED',
    `Attempt to pass production domain to staging threw: "${crossEnvStagingCode}"`
  );

  // 9. Staging strictly rejects Supabase API URL as callback
  const cfgWithSupabaseApi = getEnvironmentConfig('staging');
  // If someone sets STAGING_AUTH_RECOVERY_CALLBACK_URL to https://lvytgqsvxntnvlohmrxi.supabase.co
  process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL = 'https://lvytgqsvxntnvlohmrxi.supabase.co';
  const cfgSupabaseApiRejected = getEnvironmentConfig('staging');
  delete process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL;
  record(
    'REDIRECT',
    9,
    'Staging Rejection of Supabase API URL as App Callback',
    cfgSupabaseApiRejected.isCallbackConfigured === false &&
    cfgSupabaseApiRejected.callbackBlockedReason?.includes('Supabase API URL dilarang'),
    `Reason: "${cfgSupabaseApiRejected.callbackBlockedReason}"`
  );

  // 10. Staging strictly rejects non-HTTPS protocols (http://)
  process.env.STAGING_APP_BASE_URL = 'http://insecure-staging.com';
  const cfgInsecureHttpRejected = getEnvironmentConfig('staging');
  delete process.env.STAGING_APP_BASE_URL;
  record(
    'REDIRECT',
    10,
    'Staging Rejection of Insecure HTTP Protocol',
    cfgInsecureHttpRejected.isCallbackConfigured === false &&
    cfgInsecureHttpRejected.callbackBlockedReason?.includes('HTTPS'),
    `Reason: "${cfgInsecureHttpRejected.callbackBlockedReason}"`
  );

  // 11. Staging strictly rejects unlisted external domains
  let unlistedDomainThrew = false;
  let unlistedDomainCode = '';
  try {
    process.env.STAGING_APP_BASE_URL = 'https://valid-staging.test';
    process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL = 'https://valid-staging.test/auth';
    resolveAuthRedirectUrl('https://evil-phishing.com/steal', 'staging');
  } catch (err: any) {
    unlistedDomainThrew = true;
    unlistedDomainCode = err.code || err.message;
  } finally {
    delete process.env.STAGING_APP_BASE_URL;
    delete process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL;
  }
  record(
    'REDIRECT',
    11,
    'Staging Rejection of Unlisted External Domains (Open Redirect Guard)',
    unlistedDomainThrew && unlistedDomainCode === 'UNAUTHORIZED_REDIRECT_ORIGIN',
    `Code: "${unlistedDomainCode}"`
  );

  // 12. Staging with valid configured staging domain resolves correctly
  let stagingValidResolved = '';
  try {
    process.env.STAGING_APP_BASE_URL = 'https://valid-staging.test';
    process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL = 'https://valid-staging.test/auth/callback';
    stagingValidResolved = resolveAuthRedirectUrl(undefined, 'staging');
  } finally {
    delete process.env.STAGING_APP_BASE_URL;
    delete process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL;
  }
  record(
    'REDIRECT',
    12,
    'Staging Valid Configured Domain Resolution',
    stagingValidResolved === 'https://valid-staging.test/auth/callback',
    `Resolved URL: "${stagingValidResolved}"`
  );

  // 13. Production strictly rejects cross-environment redirect to staging domains
  let prodToStagingThrew = false;
  let prodToStagingCode = '';
  try {
    resolveAuthRedirectUrl('https://lvytgqsvxntnvlohmrxi.supabase.co', 'production');
  } catch (err: any) {
    prodToStagingThrew = true;
    prodToStagingCode = err.code || err.message;
  }
  record(
    'REDIRECT',
    13,
    'Production Rejection of Cross-Environment Staging URLs',
    prodToStagingThrew && prodToStagingCode === 'CROSS_ENVIRONMENT_REDIRECT_REJECTED',
    `Code: "${prodToStagingCode}"`
  );

  // 14. Production sanitizes unlisted external domains back to canonical production callback
  const prodSanitized = resolveAuthRedirectUrl('https://malicious-site.com/steal-keys', 'production');
  record(
    'REDIRECT',
    14,
    'Production Open Redirect Sanitization to Canonical Domain',
    prodSanitized === 'https://morajaws.ai.studio/',
    `Sanitized to: "${prodSanitized}"`
  );

  // 15. Production strictly rejects non-HTTPS protocols
  let prodHttpThrew = false;
  let prodHttpCode = '';
  try {
    resolveAuthRedirectUrl('http://morajaws.ai.studio/', 'production');
  } catch (err: any) {
    prodHttpThrew = true;
    prodHttpCode = err.code || err.message;
  }
  record(
    'REDIRECT',
    15,
    'Production Rejection of Insecure HTTP Protocol',
    prodHttpThrew && prodHttpCode === 'INVALID_PROTOCOL',
    `Code: "${prodHttpCode}"`
  );

  // ==========================================================================
  // SECTION 3: ADAPTER & CROSS-ENVIRONMENT CLIENT ISOLATION
  // ==========================================================================
  console.log('\n--- SECTION 3: ADAPTER & CROSS-ENVIRONMENT CLIENT ISOLATION ---');
  setSupabaseBackendClientForTesting(mockSupabaseClient as any);

  // 16. resetSupabaseAuthPassword in staging fails closed with STAGING_CALLBACK_NOT_CONFIGURED when staging domain is unconfigured
  setAppEnvironmentForTesting('staging');
  const stagingResetFailClosed = await resetSupabaseAuthPassword('technician@morajaws.com');
  record(
    'ADAPTER_ISOLATION',
    16,
    'Staging Password Reset Fails Closed Without Callback Domain',
    stagingResetFailClosed.success === false &&
    stagingResetFailClosed.error?.code === 'STAGING_CALLBACK_NOT_CONFIGURED',
    `Error Code: "${stagingResetFailClosed.error?.code}", Message: "${stagingResetFailClosed.error?.message}"`
  );
  setAppEnvironmentForTesting(null);

  // 17. Staging adapter strictly prevents connecting to production Supabase project
  setAppEnvironmentForTesting('staging');
  resetSupabaseBackendClientForTesting();
  process.env.STAGING_SUPABASE_URL = 'https://morajaws-production-not-staging.supabase.co';
  const stagingClientProductionBlock = getSupabaseBackendClient();
  delete process.env.STAGING_SUPABASE_URL;
  resetSupabaseBackendClientForTesting();
  setAppEnvironmentForTesting(null);
  record(
    'ADAPTER_ISOLATION',
    17,
    'Staging Client Prevents Targeting Non-Staging Project',
    stagingClientProductionBlock === null,
    'Staging client returned null when pointed to non-staging Supabase project'
  );

  // 18. Production adapter strictly prevents connecting to staging Supabase project "lvytgqsvxntnvlohmrxi"
  setAppEnvironmentForTesting('production');
  resetSupabaseBackendClientForTesting();
  process.env.PRODUCTION_SUPABASE_URL = 'https://lvytgqsvxntnvlohmrxi.supabase.co';
  process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key_minimum_length_20';
  const prodClientStagingBlock = getSupabaseBackendClient();
  delete process.env.PRODUCTION_SUPABASE_URL;
  delete process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY;
  resetSupabaseBackendClientForTesting();
  setAppEnvironmentForTesting(null);
  record(
    'ADAPTER_ISOLATION',
    18,
    'Production Client Prevents Targeting Staging Project (lvytgqsvxntnvlohmrxi)',
    prodClientStagingBlock === null,
    'Production client returned null when configured with staging project ID'
  );

  // 19. No cross-environment fallback exists between staging and production
  const stagingCfgNoFallback = getEnvironmentConfig('staging');
  record(
    'ADAPTER_ISOLATION',
    19,
    'Zero Cross-Environment Fallback on Missing Staging Values',
    stagingCfgNoFallback.recoveryCallbackUrl === '' &&
    stagingCfgNoFallback.appBaseUrl === '' &&
    stagingCfgNoFallback.isCallbackConfigured === false,
    `Staging callback is empty string (did not fall back to production domain: ${stagingCfgNoFallback.recoveryCallbackUrl !== 'https://morajaws.ai.studio/'})`
  );

  // ==========================================================================
  // SECTION 4: EXPRESS HTTP INTEGRATION TESTS
  // ==========================================================================
  console.log('\n--- SECTION 4: EXPRESS HTTP INTEGRATION TESTS ---');

  // Reset rate limits and start actual Express app on ephemeral port
  setSupabaseBackendClientForTesting(mockSupabaseClient as any);
  clearAllRecoveryRateLimitsForTesting();
  clearServerRecoveryStoreForTesting();

  const expressApp = await createExpressApp({ skipVite: true });
  const server = http.createServer(expressApp);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test Express server running at: ${baseUrl}`);

  try {
    // 20. HTTP: Browser attempt to specify environment ('staging' / 'production') rejected with 400 UNAUTHORIZED_ENVIRONMENT_MANIPULATION
    const envSpoofRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'technician@morajaws.com',
        environment: 'staging' // ATTACK: browser attempting to dictate environment
      })
    });
    const envSpoofData = await envSpoofRes.json();
    record(
      'HTTP_INTEGRATION',
      20,
      'HTTP Browser Environment Manipulation Rejected',
      envSpoofRes.status === 400 && envSpoofData.code === 'UNAUTHORIZED_ENVIRONMENT_MANIPULATION',
      `HTTP status: ${envSpoofRes.status}, code: "${envSpoofData.code}"`
    );

    // 21. HTTP: Browser attempt to specify target Supabase URL / project ID rejected with 400 UNAUTHORIZED_ENVIRONMENT_MANIPULATION
    const projSpoofRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: 'ValidPassword123!',
        recoveryToken: 'some_token',
        supabaseUrl: 'https://attacker.supabase.co' // ATTACK: browser attempting to supply target Supabase URL
      })
    });
    const projSpoofData = await projSpoofRes.json();
    record(
      'HTTP_INTEGRATION',
      21,
      'HTTP Browser Supabase Project Manipulation Rejected',
      projSpoofRes.status === 400 && projSpoofData.code === 'UNAUTHORIZED_ENVIRONMENT_MANIPULATION',
      `HTTP status: ${projSpoofRes.status}, code: "${projSpoofData.code}"`
    );

    // 22. HTTP: Browser attempt to supply verifiedUserId / userId in reset-password rejected with 400 UNAUTHORIZED_TARGET_UID
    const uidSpoofResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        recoveryToken: 'any_token',
        verifiedUserId: 'uid_superadmin_01' // ATTACK: browser attempting to supply target UID
      })
    });
    const uidSpoofResetData = await uidSpoofResetRes.json();
    record(
      'HTTP_INTEGRATION',
      22,
      'HTTP Browser verifiedUserId Rejected in reset-password',
      uidSpoofResetRes.status === 400 && uidSpoofResetData.code === 'UNAUTHORIZED_TARGET_UID',
      `HTTP status: ${uidSpoofResetRes.status}, code: "${uidSpoofResetData.code}"`
    );

    // 23. HTTP: Browser attempt to supply verifiedUserId in verify-recovery rejected with 400 UNAUTHORIZED_TARGET_UID
    const uidSpoofVerifyRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token_hash: 'valid_hash',
        userId: 'uid_superadmin_01'
      })
    });
    const uidSpoofVerifyData = await uidSpoofVerifyRes.json();
    record(
      'HTTP_INTEGRATION',
      23,
      'HTTP Browser userId Rejected in verify-recovery',
      uidSpoofVerifyRes.status === 400 && uidSpoofVerifyData.code === 'UNAUTHORIZED_TARGET_UID',
      `HTTP status: ${uidSpoofVerifyRes.status}, code: "${uidSpoofVerifyData.code}"`
    );

    // 24. HTTP: Login access token rejected as recovery proof in verify-recovery
    const dummyLoginJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ amr: [{ method: 'password' }] })).toString('base64')}.sig`;
    const loginVerifyRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: dummyLoginJwt })
    });
    const loginVerifyData = await loginVerifyRes.json();
    record(
      'HTTP_INTEGRATION',
      24,
      'HTTP Login Access Token Rejected in verify-recovery',
      loginVerifyRes.status === 400 && loginVerifyData.code === 'LOGIN_TOKEN_REJECTED_AS_RECOVERY_PROOF',
      `HTTP status: ${loginVerifyRes.status}, code: "${loginVerifyData.code}"`
    );

    // 25. HTTP: Login access token rejected as recovery proof in reset-password
    const loginResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        accessToken: dummyLoginJwt
      })
    });
    const loginResetData = await loginResetRes.json();
    record(
      'HTTP_INTEGRATION',
      25,
      'HTTP Login Access Token Rejected in reset-password',
      loginResetRes.status === 400 && loginResetData.code === 'LOGIN_TOKEN_REJECTED_AS_RECOVERY_PROOF',
      `HTTP status: ${loginResetRes.status}, code: "${loginResetData.code}"`
    );

    // 26. HTTP: Missing recovery credentials rejected with 400 MISSING_RECOVERY_CREDENTIALS
    const missingCredsRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const missingCredsData = await missingCredsRes.json();
    record(
      'HTTP_INTEGRATION',
      26,
      'HTTP Missing Recovery Credentials Rejection',
      missingCredsRes.status === 400 && missingCredsData.code === 'MISSING_RECOVERY_CREDENTIALS',
      `HTTP status: ${missingCredsRes.status}, code: "${missingCredsData.code}"`
    );

    // 27. HTTP: Malformed / invalid PKCE code rejected with 400 INVALID_RECOVERY_CODE
    const invalidPkceRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'invalid_nonexistent_pkce_code' })
    });
    const invalidPkceData = await invalidPkceRes.json();
    record(
      'HTTP_INTEGRATION',
      27,
      'HTTP Invalid PKCE Code Rejection',
      invalidPkceRes.status === 400 && invalidPkceData.code === 'INVALID_RECOVERY_CODE',
      `HTTP status: ${invalidPkceRes.status}, code: "${invalidPkceData.code}"`
    );

    // 28. HTTP: Expired recovery token rejected with 400 TOKEN_EXPIRED
    const expiredPkceRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'expired_pkce_code' })
    });
    const expiredPkceData = await expiredPkceRes.json();
    record(
      'HTTP_INTEGRATION',
      28,
      'HTTP Expired Recovery Code Rejection',
      expiredPkceRes.status === 400 && expiredPkceData.code === 'TOKEN_EXPIRED',
      `HTTP status: ${expiredPkceRes.status}, code: "${expiredPkceData.code}"`
    );

    // 29. HTTP: Token replay on already consumed recovery proof
    // First, verify a valid code to obtain a single-use recoveryToken
    const validVerifyRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: 'valid_otp_hash_technician' })
    });
    const validVerifyData = await validVerifyRes.json();
    const issuedRecToken = validVerifyData.recoveryToken;

    // Reset password using the recovery token
    const firstResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: 'NewSecurePass2026!',
        confirmPassword: 'NewSecurePass2026!',
        recoveryToken: issuedRecToken
      })
    });
    const firstResetData = await firstResetRes.json();
    const firstResetOk = firstResetRes.status === 200 && firstResetData.success === true;

    // Attempt to reuse the same recovery token (replay attack)
    const replayResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: 'ReplayAttackerPass2026!',
        confirmPassword: 'ReplayAttackerPass2026!',
        recoveryToken: issuedRecToken
      })
    });
    const replayResetData = await replayResetRes.json();
    const replayBlocked = replayResetRes.status === 400 &&
      (replayResetData.code === 'TOKEN_ALREADY_USED' || replayResetData.code === 'INVALID_RECOVERY_TOKEN');

    record(
      'HTTP_INTEGRATION',
      29,
      'HTTP Recovery Token Replay Prevention (Single-Use)',
      firstResetOk && replayBlocked,
      `First use succeeded: ${firstResetOk}, Replay blocked with: "${replayResetData.code}"`
    );

    // 30. HTTP: End-to-end recovery flow with valid proof (OTP token_hash -> verify -> reset password)
    // Verify PKCE code
    const pkceVerifyRes = await fetch(`${baseUrl}/api/auth/verify-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'valid_pkce_code_technician' })
    });
    const pkceVerifyData = await pkceVerifyRes.json();
    let e2ePassResetOk = false;
    if (pkceVerifyData.success && pkceVerifyData.recoveryToken) {
      const e2eResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: 'TechnicianFinalPassword2026!',
          confirmPassword: 'TechnicianFinalPassword2026!',
          recoveryToken: pkceVerifyData.recoveryToken
        })
      });
      const e2eResetData = await e2eResetRes.json();
      e2ePassResetOk = e2eResetRes.status === 200 && e2eResetData.success === true;
    }
    record(
      'HTTP_INTEGRATION',
      30,
      'HTTP End-to-End Recovery Flow with PKCE Code Proof',
      Boolean(pkceVerifyData.success && e2ePassResetOk),
      `Verified masked email: "${pkceVerifyData.email}", Reset succeeded: ${e2ePassResetOk}`
    );

    // 31. HTTP: Anti-enumeration defense on forgot-password preserves identical response without leaking account existence
    const enumRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'non_existent_staff_account' })
    });
    const enumData = await enumRes.json();
    record(
      'HTTP_INTEGRATION',
      31,
      'HTTP Anti-Enumeration Defense on Forgot Password',
      enumRes.status === 200 && enumData.success === true && !enumData.email && enumData.message.includes('Jika akun terdaftar'),
      `Returned generic 200 message without disclosing user non-existence`
    );

    // 32. HTTP: Rate limiting triggers 429 when threshold exceeded
    let triggeredRateLimit = false;
    let lastStatus = 0;
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: 'InvalidShort',
          recoveryToken: 'invalid_token_burst'
        })
      });
      lastStatus = res.status;
      if (res.status === 429) {
        triggeredRateLimit = true;
        break;
      }
    }
    record(
      'HTTP_INTEGRATION',
      32,
      'HTTP Rate Limiting Threshold Enforcement',
      triggeredRateLimit,
      `Rate limit successfully triggered HTTP 429 (last status: ${lastStatus})`
    );

    // 33. Express trusted proxy configuration (app.get('trust proxy') === 1)
    const trustProxySetting = expressApp.get('trust proxy');
    record(
      'HTTP_INTEGRATION',
      33,
      'Express Trusted Proxy Configuration',
      trustProxySetting === 1 || trustProxySetting === true,
      `app.get('trust proxy') is configured to: ${trustProxySetting}`
    );

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('Test Express server stopped.');
  }

  // ==========================================================================
  // SECTION 5: SECRETS AUDIT & RECOVERY STORE LIMITATIONS
  // ==========================================================================
  console.log('\n--- SECTION 5: SECRETS AUDIT & RECOVERY STORE LIMITATIONS ---');

  // 34. Frontend source code audit (no service role key, secret key, or staging/production credentials in src/)
  const srcFiles = fs.readdirSync(path.join(process.cwd(), 'src'), { recursive: true }) as string[];
  let secretFoundInFrontend = false;
  let leakedFile = '';
  for (const f of srcFiles) {
    const fullPath = path.join(process.cwd(), 'src', String(f));
    if (fs.statSync(fullPath).isFile() && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (
        content.includes('sb_secret_') ||
        /(?:service_role_key|secret_key|serviceRoleKey)\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{10,}['"`]/i.test(content) ||
        /['"`]eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-\.]{20,}['"`]/.test(content)
      ) {
        secretFoundInFrontend = true;
        leakedFile = f;
        break;
      }
    }
  }
  record(
    'STORE_AND_SECRETS',
    34,
    'Frontend Source Code Secrets Audit',
    !secretFoundInFrontend,
    secretFoundInFrontend ? `Leaked credential in ${leakedFile}` : 'Zero service role keys or sensitive secrets in src/'
  );

  // 35. .env.example contains only placeholders without real credentials or secrets
  const envExampleContent = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
  const envLines = envExampleContent.split('\n');
  let hasRealSecretInExample = false;
  let offendingLine = '';
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [_, ...vParts] = trimmed.split('=');
    const val = vParts.join('=').trim();
    if (!val || val === 'production' || val === 'staging' || val === 'development' || val === '1' || val === '0' || val === 'true' || val === 'false') continue;
    if (val.startsWith('http://') || val.startsWith('https://') || val === 'lvytgqsvxntnvlohmrxi') continue;

    if (val.startsWith('sb_secret_') || val.startsWith('eyJ') || val.includes('AIzaSy') || val.length > 25) {
      hasRealSecretInExample = true;
      offendingLine = trimmed;
      break;
    }
  }

  record(
    'STORE_AND_SECRETS',
    35,
    '.env.example Secrets & Placeholders Audit',
    !hasRealSecretInExample,
    hasRealSecretInExample ? `Found real secret in .env.example: ${offendingLine}` : 'All environment examples contain placeholders only'
  );

  // 36. Recovery transaction store TTL and single-use validation
  clearServerRecoveryStoreForTesting();
  const txToken = createRecoveryTransaction('uid_technician_02', 'technician@morajaws.com');
  const validCheck = getValidRecoveryTransaction(txToken);
  const ttlValid = validCheck.valid && validCheck.tx && (validCheck.tx.expiresAt - validCheck.tx.createdAt === 5 * 60 * 1000);
  record(
    'STORE_AND_SECRETS',
    36,
    'Recovery Transaction Store Strict 5-Minute TTL & Binding',
    Boolean(ttlValid),
    `TTL strictly configured to 5 minutes (${(validCheck.tx?.expiresAt || 0) - (validCheck.tx?.createdAt || 0)}ms)`
  );

  // 37. Multi-Instance Distributed Rate Limiting & Shared Store Status
  // In-memory JavaScript Map is used. Without external Redis, multi-instance is not supported.
  testResults.push({
    category: 'STORE_AND_SECRETS',
    number: 37,
    name: 'Multi-Instance Distributed Rate Limiting & Shared Recovery Store (Redis / Valkey)',
    status: 'BLOCKED',
    detail: 'BLOCKED / PARTIAL: Distributed cache (Redis / Valkey) is not configured in current hosting environment. Store currently uses in-memory Map (isolated per process instance).'
  });

  // ==========================================================================
  // FINAL REPORT
  // ==========================================================================
  console.log('\n================================================================');
  console.log('                 FINAL TEST EXECUTION SUMMARY                   ');
  console.log('================================================================');

  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;
  let notTestedCount = 0;

  for (const r of testResults) {
    const prefix = `[${r.status}] [${r.category}] #${r.number} ${r.name}`;
    console.log(`${prefix}: ${r.detail}`);
    if (r.status === 'PASS') passCount++;
    else if (r.status === 'FAIL') failCount++;
    else if (r.status === 'BLOCKED') blockedCount++;
    else if (r.status === 'NOT TESTED') notTestedCount++;
  }

  console.log('----------------------------------------------------------------');
  console.log(`TOTAL CHECKS: ${testResults.length}`);
  console.log(`PASS        : ${passCount}`);
  console.log(`FAIL        : ${failCount}`);
  console.log(`BLOCKED     : ${blockedCount}`);
  console.log(`NOT TESTED  : ${notTestedCount}`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test suite exception:', err);
  process.exit(1);
});
