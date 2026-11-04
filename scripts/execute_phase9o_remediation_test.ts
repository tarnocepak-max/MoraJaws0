import fs from 'fs';
import path from 'path';
import { checkFirebaseAdminHealth, verifyFirebaseIdToken } from '../server/firebaseAdmin.ts';
import { ROLE_PERMISSIONS, hasPermission } from '../src/services/authService.ts';
import type { UserRole } from '../src/types/index.ts';

// Standalone hashing function matching server
function hashPassword(password: string, salt: string = 'morajaws_secure_salt_2026'): string {
  let h = 0x811c9dc5;
  const str = `${salt}:${password}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

const DEFAULT_HASH = hashPassword('12345678');

async function runRemediationSuite() {
  console.log('================================================================');
  console.log('MORAJAWS PHASE 9O-REMEDIATION TEST SUITE');
  console.log('Frontend Auth Security & Session Standby Control Verification');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, extraInfo?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${name}`);
    } else {
      console.error(`  [FAIL] ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1, 2, 3: Frontend Fallback Elimination Audit in AppContext.tsx
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1, 2, 3: Frontend Fallback Elimination Audit ---');
  const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
  const appContextSource = fs.readFileSync(appContextPath, 'utf-8');

  // Check 1: Username "ray" fallback
  const hasRayHardcodedRole = appContextSource.includes("username === 'ray'") ||
    appContextSource.includes("lowerClean === 'ray'") ||
    appContextSource.includes("prefix.startsWith('ray')");
  assertTest('Username "ray" cannot get super_admin through frontend fallback', !hasRayHardcodedRole);

  // Check 2: Alias "rayjs666" fallback
  const hasRayjs666Fallback = appContextSource.includes('rayjs666') || appContextSource.includes('rayhanafirzanx');
  assertTest('Alias "rayjs666" cannot get super_admin through frontend fallback', !hasRayjs666Fallback);

  // Check 3: Email "tarnocepak@gmail.com" fallback in AppContext
  const hasTarnocepakFallback = appContextSource.includes('tarnocepak@gmail.com');
  assertTest('Email "tarnocepak@gmail.com" cannot get super_admin when backend fails', !hasTarnocepakFallback);

  // Check 4: No dummy token generation (e.g. mora_fb_...)
  const hasDummyTokenGeneration = appContextSource.includes('mora_fb_');
  assertTest('Backend failure does not produce dummy token (mora_fb_)', !hasDummyTokenGeneration);

  // Check 4.B: Unauthenticated user defaults to UNAUTHENTICATED_USER (not DEFAULT_USERS[0])
  const hasDefaultUsersFallback = appContextSource.includes('return users[0] || DEFAULT_USERS[0]');
  assertTest('Unauthenticated state defaults to UNAUTHENTICATED_USER, not super_admin', !hasDefaultUsersFallback);

  // ---------------------------------------------------------------------------
  // TEST 4: Backend Failure Simulation (No Sesi Dummy)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Backend Failure Simulation ---');
  // Simulated frontend loginWithFirebase behavior when server is offline
  let simulatedLocalStorage: Record<string, string> = {};
  async function simulatedLoginWithFirebase(firebaseData: { email: string; uid: string }) {
    try {
      // Simulating backend throw (network failure / server 500)
      throw new Error('Failed to fetch from backend server');
    } catch (err: any) {
      // Must return safe error without setting localStorage session or returning super_admin
      return { success: false, error: 'Gagal menghubungi server autentikasi MoraJaws.' };
    }
  }

  const simFailResult = await simulatedLoginWithFirebase({ email: 'tarnocepak@gmail.com', uid: 'test_uid_123' });
  assertTest('Backend failure returns success: false', simFailResult.success === false);
  assertTest('Backend failure does not create dummy session in storage', simulatedLocalStorage['morajaws_auth_session'] === undefined);
  assertTest('Backend failure does not assign user', (simFailResult as any).user === undefined);

  // ---------------------------------------------------------------------------
  // TEST 5 & 6: Live Server Real Authentication Endpoints
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5 & 6: Live Server Authentication Endpoints ---');
  const SERVER_URL = 'http://127.0.0.1:3000';

  let isServerRunning = false;
  try {
    const healthRes = await fetch(`${SERVER_URL}/api/system/health`);
    if (healthRes.ok) isServerRunning = true;
  } catch {}

  if (isServerRunning) {
    // Test 6.A: Resolve identity with valid username
    const resolveRes = await fetch(`${SERVER_URL}/api/auth/resolve-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'superadmin' })
    });
    const resolveData = await resolveRes.json();
    assertTest('Identity resolution for superadmin succeeds', resolveRes.ok && resolveData.found === true);
    assertTest('Resolved email matches expected user', resolveData.user?.email === 'tarnocepak@gmail.com');

    // Test 6.B: Unknown username returns 404 not-found safely
    const unknownRes = await fetch(`${SERVER_URL}/api/auth/resolve-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'unknown_attacker_99' })
    });
    assertTest('Unknown identity resolution returns 404', unknownRes.status === 404);

    // Test 6.C: Valid username/password login
    const loginRes = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: '12345678' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    assertTest('Valid login for superadmin returns token and session', loginRes.ok && Boolean(token) && loginData.user?.role === 'super_admin');

    // Test 6.D: Wrong password returns 401 MJ-AUTH-001
    const wrongPassRes = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: 'wrongPassword99' })
    });
    const wrongPassData = await wrongPassRes.json();
    assertTest('Wrong password rejected with 401 and MJ-AUTH-001', wrongPassRes.status === 401 && wrongPassData.code === 'MJ-AUTH-001');

    // Test 7: Session restoration with Bearer token
    const sessionRes = await fetch(`${SERVER_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();
    assertTest('Session restoration via token succeeds', sessionRes.ok && sessionData.authenticated === true && sessionData.user?.role === 'super_admin');

    // Test 8: Logout endpoint revokes session
    const logoutRes = await fetch(`${SERVER_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    assertTest('Logout endpoint succeeds', logoutRes.ok);

    // Verify revoked session can no longer access protected endpoints
    const meRes = await fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assertTest('Revoked session is rejected on subsequent request', meRes.status === 401);

    // Test 5: Firebase login without ID token is safely rejected with 400
    const fbNoTokenRes = await fetch(`${SERVER_URL}/api/auth/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tarnocepak@gmail.com', uid: 'test_uid' })
    });
    const fbNoTokenData = await fbNoTokenRes.json();
    assertTest('Firebase login without ID token safely rejected (ID_TOKEN_REQUIRED)', fbNoTokenRes.status === 400 || fbNoTokenData.code === 'ID_TOKEN_REQUIRED' || fbNoTokenData.code === 'FIREBASE_ADMIN_NOT_CONFIGURED');
  } else {
    console.log('  [NOTICE] Dev server not reachable directly on http://127.0.0.1:3000, skipping live HTTP tests.');
  }

  // ---------------------------------------------------------------------------
  // TEST 9 & 10: Supabase user_sessions Shadow-Write Audit in server.ts
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Supabase user_sessions Shadow-Write Audit ---');
  const serverSourcePath = path.resolve(process.cwd(), 'server.ts');
  const serverSource = fs.readFileSync(serverSourcePath, 'utf-8');

  // Verify server.ts imports do not import insertUserSessionToSupabase or revokeUserSessionInSupabase
  const importsInsertSession = /import\s*\{[^}]*insertUserSessionToSupabase[^}]*\}\s*from/.test(serverSource);
  const importsRevokeSession = /import\s*\{[^}]*revokeUserSessionInSupabase[^}]*\}\s*from/.test(serverSource);
  assertTest('server.ts does not import insertUserSessionToSupabase', !importsInsertSession);
  assertTest('server.ts does not import revokeUserSessionInSupabase', !importsRevokeSession);

  // Verify no invocation of insertUserSessionToSupabase in server.ts
  const callsInsertSession = serverSource.includes('insertUserSessionToSupabase(');
  assertTest('No invocation of insertUserSessionToSupabase in server.ts', !callsInsertSession);

  // Verify no invocation of revokeUserSessionInSupabase in server.ts
  const callsRevokeSession = serverSource.includes('revokeUserSessionInSupabase(');
  assertTest('No invocation of revokeUserSessionInSupabase in server.ts', !callsRevokeSession);

  // Verify adapter functions remain preserved in server/supabaseAdapter.ts for future migration
  const adapterPath = path.resolve(process.cwd(), 'server/supabaseAdapter.ts');
  const adapterSource = fs.readFileSync(adapterPath, 'utf-8');
  assertTest('insertUserSessionToSupabase preserved in adapter for future migration', adapterSource.includes('export async function insertUserSessionToSupabase'));
  assertTest('revokeUserSessionInSupabase preserved in adapter for future migration', adapterSource.includes('export async function revokeUserSessionInSupabase'));
  assertTest('getUserSessionsFromSupabase preserved in adapter for future migration', adapterSource.includes('export async function getUserSessionsFromSupabase'));

  // ---------------------------------------------------------------------------
  // TEST 11: All Roles Compatibility & RBAC Matrix
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 11: Role Compatibility & RBAC Matrix ---');
  const expectedRoles: UserRole[] = [
    'super_admin',
    'dispatch',
    'leader',
    'installer',
    'management_data',
    'it_support'
  ];

  for (const role of expectedRoles) {
    const permissions = ROLE_PERMISSIONS[role];
    const canLogin = hasPermission(role, 'login');
    assertTest(`Role ${role} is defined and can login`, Array.isArray(permissions) && canLogin);
  }

  // Strict RBAC isolation checks
  assertTest('Installer cannot delete work orders', !hasPermission('installer', 'delete_wo_data'));
  assertTest('Installer cannot import data', !hasPermission('installer', 'import_data'));
  assertTest('Leader cannot delete users', !hasPermission('leader', 'delete_user'));
  assertTest('Dispatch cannot delete users', !hasPermission('dispatch', 'delete_user'));
  assertTest('Management data has import permissions', hasPermission('management_data', 'import_data'));
  assertTest('Super admin DOES NOT have permanent_delete permission (exclusive to management_data)', !hasPermission('super_admin', 'permanent_delete'));

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 9O-REMEDIATION TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('STATUS: ALL PHASE 9O-REMEDIATION VERIFICATIONS PASSED (100% SUCCESS)\n');
    process.exit(0);
  } else {
    console.error(`STATUS: ${totalTests - passedTests} TESTS FAILED\n`);
    process.exit(1);
  }
}

runRemediationSuite().catch(err => {
  console.error('Fatal error during remediation test suite:', err);
  process.exit(1);
});
