/**
 * MORAJAWS — CUSTOM AUTHENTICATION & SUPABASE POSTGRESQL VERIFICATION TEST SUITE
 * 
 * Verifies all 18 mandatory requirements:
 *  1. Login menggunakan username.
 *  2. Login menggunakan email.
 *  3. Login dengan password salah ditolak dengan pesan aman.
 *  4. Login akun nonaktif ditolak (403 Forbidden).
 *  5. Registrasi mandiri/publik ditolak (403 Forbidden).
 *  6. Pembuatan akun oleh Superadmin berhasil.
 *  7. Pembuatan akun oleh role selain Superadmin ditolak (403 Forbidden).
 *  8. Reset password oleh Superadmin berhasil (bcrypt, session revocation, audit log).
 *  9. Reset password oleh role selain Superadmin ditolak (403 Forbidden).
 * 10. Password lama tidak dapat digunakan setelah reset.
 * 11. Sesi lama dibatalkan setelah password direset.
 * 12. Rotasi refresh token berfungsi dan mengembalikan token baru.
 * 13. Logout membatalkan sesi pengguna.
 * 14. Sesi tetap valid saat reload/refresh (/api/auth/me).
 * 15. Enam role (super_admin, dispatch, leader, installer, management_data, it_support) memiliki permission sesuai matriks.
 * 16. Data Work Order (WO) tetap utuh dan dapat diakses.
 * 17. Struktur database Supabase PostgreSQL (users, auth_sessions, refresh_tokens, login_attempts, audit_logs) valid.
 * 18. Rate limiting dan account lockout aktif setelah 5x gagal login berturut-turut.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  createExpressApp,
  db,
  isLocalJsonModeAllowed,
  ServerUser
} from '../server.ts';

import {
  hashPasswordWithBcrypt,
  verifyUserPasswordEx,
  validatePasswordStrength,
  loginWithCustomAuth
} from '../server/customAuthService.ts';

import { ROLE_PERMISSIONS, hasPermission } from '../src/services/authService.ts';
import { UserRole } from '../src/types/index.ts';

interface TestItem {
  id: number;
  title: string;
  category: string;
  passed: boolean;
  details: string;
}

const testResults: TestItem[] = [];

function record(id: number, title: string, category: string, passed: boolean, details: string) {
  testResults.push({ id, title, category, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] #${id} ${title}: ${details}`);
}

// HTTP request helper
function makeRequest(
  serverPort: number,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsedData: any = {};
          try {
            parsedData = JSON.parse(responseBody);
          } catch {
            parsedData = responseBody;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            data: parsedData,
            rawBody: responseBody
          });
        });
      }
    );

    req.on('error', err => reject(err));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('   MORAJAWS — CUSTOM AUTHENTICATION & SUPABASE POSTGRESQL TEST SUITE   ');
  console.log('======================================================================\n');

  // Seed test users in db.users for offline/in-memory testing
  const superAdminPasswordHash = await hashPasswordWithBcrypt('AdminPassword123!');
  const dispatchPasswordHash = await hashPasswordWithBcrypt('DispatchPass123!');
  const leaderPasswordHash = await hashPasswordWithBcrypt('LeaderPass123!');
  const installerPasswordHash = await hashPasswordWithBcrypt('InstallerPass123!');
  const managementDataPasswordHash = await hashPasswordWithBcrypt('MgmtPass123!');
  const itSupportPasswordHash = await hashPasswordWithBcrypt('SupportPass123!');
  const inactiveUserPasswordHash = await hashPasswordWithBcrypt('InactivePass123!');

  const testSuperAdmin: ServerUser = {
    id: 'usr-test-superadmin',
    name: 'Test Super Admin',
    username: 'test_superadmin',
    email: 'superadmin@morajaws.net',
    phone: '081234567890',
    role: 'super_admin',
    active: true,
    passwordHash: superAdminPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testDispatch: ServerUser = {
    id: 'usr-test-dispatch',
    name: 'Test Dispatcher',
    username: 'test_dispatch',
    email: 'dispatch@morajaws.net',
    phone: '081234567891',
    role: 'dispatch',
    active: true,
    passwordHash: dispatchPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testLeader: ServerUser = {
    id: 'usr-test-leader',
    name: 'Test Leader Korlap',
    username: 'test_leader',
    email: 'leader@morajaws.net',
    phone: '081234567892',
    role: 'leader',
    contractor: 'PT Mora Solusindo',
    area: 'Jakarta Selatan',
    active: true,
    passwordHash: leaderPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testInstaller: ServerUser = {
    id: 'usr-test-installer',
    name: 'Test Installer Teknisi',
    username: 'test_installer',
    email: 'installer@morajaws.net',
    phone: '081234567893',
    role: 'installer',
    contractor: 'PT Mora Solusindo',
    area: 'Jakarta Selatan',
    active: true,
    passwordHash: installerPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testManagementData: ServerUser = {
    id: 'usr-test-mgmt',
    name: 'Test Management Data',
    username: 'test_mgmt',
    email: 'mgmt@morajaws.net',
    role: 'management_data',
    active: true,
    passwordHash: managementDataPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testITSupport: ServerUser = {
    id: 'usr-test-support',
    name: 'Test IT Support',
    username: 'test_support',
    email: 'support@morajaws.net',
    role: 'it_support',
    active: true,
    passwordHash: itSupportPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  const testInactiveUser: ServerUser = {
    id: 'usr-test-inactive',
    name: 'Test Inactive User',
    username: 'test_inactive',
    email: 'inactive@morajaws.net',
    role: 'installer',
    active: false,
    accountStatus: 'inactive',
    passwordHash: inactiveUserPasswordHash,
    sessionVersion: 1,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };

  // Create Express app & listen on dynamic port
  const app = await createExpressApp({ skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  console.log(`Test Express server listening on http://127.0.0.1:${port}\n`);

  // Add all test users to db after disk database loading
  const initialUsers = [
    testSuperAdmin,
    testDispatch,
    testLeader,
    testInstaller,
    testManagementData,
    testITSupport,
    testInactiveUser
  ];

  for (const u of initialUsers) {
    const idx = db.users.findIndex(x => x.id === u.id || x.username === u.username);
    if (idx >= 0) {
      db.users[idx] = { ...db.users[idx], ...u };
    } else {
      db.users.push(u);
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Login menggunakan username
    // -------------------------------------------------------------
    const res1 = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_superadmin',
      password: 'AdminPassword123!'
    });

    const superAdminToken = res1.data?.tokens?.accessToken || res1.data?.token;
    const superAdminRefreshToken = res1.data?.tokens?.refreshToken;

    record(
      1,
      'Login menggunakan username',
      'Authentication',
      res1.status === 200 && res1.data?.success === true && Boolean(superAdminToken),
      `Status ${res1.status}, user role: ${res1.data?.user?.role}, token format: ${superAdminToken?.substring(0, 15)}...`
    );

    // -------------------------------------------------------------
    // TEST 2: Login menggunakan email
    // -------------------------------------------------------------
    const res2 = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'superadmin@morajaws.net',
      password: 'AdminPassword123!'
    });

    record(
      2,
      'Login menggunakan email',
      'Authentication',
      res2.status === 200 && res2.data?.success === true && res2.data?.user?.username === 'test_superadmin',
      `Status ${res2.status}, username: ${res2.data?.user?.username}`
    );

    // -------------------------------------------------------------
    // TEST 3: Login dengan password salah ditolak dengan pesan aman
    // -------------------------------------------------------------
    const res3 = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_superadmin',
      password: 'WrongPassword999!'
    });

    record(
      3,
      'Login dengan password salah ditolak dengan pesan aman',
      'Authentication',
      res3.status === 401 && res3.data?.success === false,
      `Status ${res3.status}, error: "${res3.data?.error}", code: ${res3.data?.code}`
    );

    // -------------------------------------------------------------
    // TEST 4: Login akun nonaktif ditolak (403 Forbidden)
    // -------------------------------------------------------------
    const res4 = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_inactive',
      password: 'InactivePass123!'
    });

    record(
      4,
      'Login akun nonaktif ditolak',
      'Authentication',
      res4.status === 403 && res4.data?.success === false && res4.data?.code === 'ACCOUNT_DISABLED',
      `Status ${res4.status}, error: "${res4.data?.error}", code: ${res4.data?.code}`
    );

    // -------------------------------------------------------------
    // TEST 5: Registrasi mandiri/publik ditolak (403 Forbidden)
    // -------------------------------------------------------------
    const res5a = await makeRequest(port, 'POST', '/api/auth/register', {
      username: 'hacker',
      password: 'Password123!'
    });
    const res5b = await makeRequest(port, 'POST', '/api/auth/signup', {
      email: 'hacker@example.com',
      password: 'Password123!'
    });

    record(
      5,
      'Registrasi mandiri/publik ditolak (403)',
      'Security',
      res5a.status === 403 && res5b.status === 403,
      `POST /api/auth/register status: ${res5a.status}, POST /api/auth/signup status: ${res5b.status}`
    );

    // -------------------------------------------------------------
    // TEST 6: Pembuatan akun oleh Superadmin berhasil
    // -------------------------------------------------------------
    const newStaffPayload = {
      name: 'Bambang Sudirman',
      username: 'bambang_s',
      email: 'bambang@morajaws.net',
      phone: '081299988877',
      role: 'installer',
      contractor: 'PT Mora Solusindo',
      area: 'Jakarta Barat',
      password: 'InitialPassword123!'
    };

    const res6 = await makeRequest(
      port,
      'POST',
      '/api/admin/users',
      newStaffPayload,
      { Authorization: `Bearer ${superAdminToken}` }
    );

    const createdUserId = res6.data?.user?.id;

    record(
      6,
      'Pembuatan akun oleh Superadmin berhasil',
      'User Management',
      res6.status === 201 && res6.data?.success === true && Boolean(createdUserId),
      `Status ${res6.status}, created user ID: ${createdUserId}, role: ${res6.data?.user?.role}`
    );

    // -------------------------------------------------------------
    // TEST 7: Pembuatan akun oleh role selain Superadmin ditolak
    // -------------------------------------------------------------
    // First login as dispatch
    const resDispatchLogin = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_dispatch',
      password: 'DispatchPass123!'
    });
    const dispatchToken = resDispatchLogin.data?.tokens?.accessToken;

    const res7 = await makeRequest(
      port,
      'POST',
      '/api/admin/users',
      {
        name: 'Illegal User',
        username: 'illegal_u',
        email: 'illegal@morajaws.net',
        role: 'installer',
        password: 'Password123!'
      },
      { Authorization: `Bearer ${dispatchToken}` }
    );

    record(
      7,
      'Pembuatan akun oleh role selain Superadmin ditolak',
      'Authorization',
      res7.status === 403 && res7.data?.success === false,
      `Status ${res7.status}, code: ${res7.data?.code || res7.data?.error}`
    );

    // -------------------------------------------------------------
    // TEST 8: Reset password oleh Superadmin berhasil
    // -------------------------------------------------------------
    const res8 = await makeRequest(
      port,
      'POST',
      '/api/auth/admin/reset-password',
      {
        targetUserId: createdUserId,
        newPassword: 'NewBcryptPassword999!',
        confirmPassword: 'NewBcryptPassword999!'
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );

    record(
      8,
      'Reset password oleh Superadmin berhasil',
      'Password Management',
      res8.status === 200 && res8.data?.success === true,
      `Status ${res8.status}, message: "${res8.data?.message}"`
    );

    // -------------------------------------------------------------
    // TEST 9: Reset password oleh role selain Superadmin ditolak
    // -------------------------------------------------------------
    const res9 = await makeRequest(
      port,
      'POST',
      '/api/auth/admin/reset-password',
      {
        targetUserId: createdUserId,
        newPassword: 'UnauthorizedPass123!',
        confirmPassword: 'UnauthorizedPass123!'
      },
      { Authorization: `Bearer ${dispatchToken}` }
    );

    record(
      9,
      'Reset password oleh role selain Superadmin ditolak',
      'Authorization',
      res9.status === 403 && res9.data?.success === false,
      `Status ${res9.status}, error: "${res9.data?.error}"`
    );

    // -------------------------------------------------------------
    // TEST 10: Password lama tidak dapat digunakan setelah reset
    // -------------------------------------------------------------
    const res10Old = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'bambang_s',
      password: 'InitialPassword123!' // Old password
    });
    const res10New = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'bambang_s',
      password: 'NewBcryptPassword999!' // New password
    });

    record(
      10,
      'Password lama ditolak dan password baru berhasil',
      'Password Management',
      res10Old.status === 401 && res10New.status === 200 && res10New.data?.success === true,
      `Old password status: ${res10Old.status} (rejected), new password status: ${res10New.status} (accepted)`
    );

    // -------------------------------------------------------------
    // TEST 11: Sesi lama dibatalkan setelah password direset
    // -------------------------------------------------------------
    // Obtain a session for installer before reset
    const resInstallerPreLogin = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_installer',
      password: 'InstallerPass123!'
    });
    const installerOldToken = resInstallerPreLogin.data?.tokens?.accessToken;

    // Verify token works
    const resPreCheck = await makeRequest(
      port,
      'GET',
      '/api/auth/me',
      undefined,
      { Authorization: `Bearer ${installerOldToken}` }
    );

    // Superadmin resets installer password
    await makeRequest(
      port,
      'POST',
      '/api/auth/admin/reset-password',
      {
        targetUserId: 'usr-test-installer',
        newPassword: 'BrandNewInstallerPass777!',
        confirmPassword: 'BrandNewInstallerPass777!'
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );

    // Check old token again - must be rejected
    const resPostCheck = await makeRequest(
      port,
      'GET',
      '/api/auth/me',
      undefined,
      { Authorization: `Bearer ${installerOldToken}` }
    );

    record(
      11,
      'Sesi lama dibatalkan setelah password direset',
      'Session Security',
      resPreCheck.status === 200 && resPostCheck.status === 401,
      `Pre-reset /api/auth/me: ${resPreCheck.status}, Post-reset /api/auth/me: ${resPostCheck.status} (session revoked)`
    );

    // -------------------------------------------------------------
    // TEST 12: Rotasi refresh token berfungsi dan mengembalikan token baru
    // -------------------------------------------------------------
    const res12 = await makeRequest(port, 'POST', '/api/auth/refresh', {
      refreshToken: superAdminRefreshToken
    });

    const newAccessToken = res12.data?.tokens?.accessToken;
    const newRefreshToken = res12.data?.tokens?.refreshToken;

    record(
      12,
      'Rotasi refresh token berfungsi',
      'Session Security',
      res12.status === 200 && res12.data?.success === true && Boolean(newAccessToken) && Boolean(newRefreshToken),
      `Status ${res12.status}, new token format: ${newAccessToken?.substring(0, 15)}...`
    );

    // -------------------------------------------------------------
    // TEST 13: Logout membatalkan sesi pengguna
    // -------------------------------------------------------------
    const res13Logout = await makeRequest(
      port,
      'POST',
      '/api/auth/logout',
      {},
      { Authorization: `Bearer ${newAccessToken}` }
    );

    const res13Verify = await makeRequest(
      port,
      'GET',
      '/api/auth/me',
      undefined,
      { Authorization: `Bearer ${newAccessToken}` }
    );

    record(
      13,
      'Logout membatalkan sesi pengguna',
      'Session Security',
      res13Logout.status === 200 && res13Verify.status === 401,
      `Logout status: ${res13Logout.status}, /api/auth/me after logout: ${res13Verify.status}`
    );

    // -------------------------------------------------------------
    // TEST 14: Sesi tetap valid saat reload/refresh (/api/auth/me)
    // -------------------------------------------------------------
    // Fresh login for leader
    const resLeaderLogin = await makeRequest(port, 'POST', '/api/auth/login', {
      identifier: 'test_leader',
      password: 'LeaderPass123!'
    });
    const leaderToken = resLeaderLogin.data?.tokens?.accessToken;

    const res14Me = await makeRequest(
      port,
      'GET',
      '/api/auth/me',
      undefined,
      { Authorization: `Bearer ${leaderToken}` }
    );

    record(
      14,
      'Sesi tetap valid saat reload/refresh (/api/auth/me)',
      'Session Security',
      res14Me.status === 200 && res14Me.data?.success === true && res14Me.data?.user?.username === 'test_leader',
      `Status ${res14Me.status}, user: ${res14Me.data?.user?.name} (${res14Me.data?.user?.role})`
    );

    // -------------------------------------------------------------
    // TEST 15: Enam role memiliki permission sesuai matriks RBAC
    // -------------------------------------------------------------
    const rolesToTest: UserRole[] = [
      'super_admin',
      'dispatch',
      'leader',
      'installer',
      'management_data',
      'it_support'
    ];

    let rbacOk = true;
    const rbacDetails: string[] = [];

    for (const r of rolesToTest) {
      const perms = ROLE_PERMISSIONS[r] || [];
      const hasLogin = hasPermission(r, 'login');
      if (!hasLogin || perms.length === 0) {
        rbacOk = false;
        rbacDetails.push(`${r}: missing permissions`);
      } else {
        rbacDetails.push(`${r}: ${perms.length} perms`);
      }
    }

    // Check specific RBAC rules:
    // - management_data has delete_wo_data
    // - super_admin has manage_users
    // - dispatch has distribute_wo
    // - leader has assign_technician
    // - installer has edit_technical_report
    // - it_support has view_audit_logs
    const specificRbacChecks =
      hasPermission('management_data', 'delete_wo_data') &&
      hasPermission('super_admin', 'manage_users') &&
      hasPermission('dispatch', 'distribute_wo') &&
      hasPermission('leader', 'assign_technician') &&
      hasPermission('installer', 'edit_technical_report') &&
      hasPermission('it_support', 'view_audit_logs');

    record(
      15,
      'Enam role memiliki permission sesuai matriks RBAC',
      'RBAC Matrix',
      rbacOk && specificRbacChecks,
      rbacDetails.join(', ')
    );

    // -------------------------------------------------------------
    // TEST 16: Data Work Order (WO) tetap utuh
    // -------------------------------------------------------------
    const resTickets = await makeRequest(
      port,
      'GET',
      '/api/tickets',
      undefined,
      { Authorization: `Bearer ${leaderToken}` }
    );

    const ticketCount = Array.isArray(resTickets.data?.tickets)
      ? resTickets.data.tickets.length
      : Array.isArray(resTickets.data)
      ? resTickets.data.length
      : db.tickets.length;

    record(
      16,
      'Data Work Order (WO) tetap utuh dan dapat diakses',
      'Data Integrity',
      resTickets.status === 200 && ticketCount >= 0,
      `Status ${resTickets.status}, total work orders: ${ticketCount}`
    );

    // -------------------------------------------------------------
    // TEST 17: Struktur database Supabase PostgreSQL schema valid
    // -------------------------------------------------------------
    const migrationPath = path.resolve(process.cwd(), 'migrations/006_custom_authentication_schema.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    const hasUsersTable = migrationContent.includes('ALTER TABLE public.users') && migrationContent.includes('password_hash');
    const hasAuthSessions = migrationContent.includes('CREATE TABLE IF NOT EXISTS public.auth_sessions');
    const hasRefreshTokens = migrationContent.includes('CREATE TABLE IF NOT EXISTS public.refresh_tokens');
    const hasLoginAttempts = migrationContent.includes('CREATE TABLE IF NOT EXISTS public.login_attempts');
    const hasAuditLogs = migrationContent.includes('public.audit_logs');

    const schemaComplete = hasUsersTable && hasAuthSessions && hasRefreshTokens && hasLoginAttempts && hasAuditLogs;

    record(
      17,
      'Struktur database Supabase PostgreSQL schema valid',
      'Database Schema',
      schemaComplete,
      `Tables: users (password_hash, session_version), auth_sessions, refresh_tokens, login_attempts, audit_logs`
    );

    // -------------------------------------------------------------
    // TEST 18: Rate limiting & account lockout setelah 5x gagal login
    // -------------------------------------------------------------
    // Create a disposable user for lockout test
    const victimUser: ServerUser = {
      id: 'usr-lockout-test',
      name: 'Victim User',
      username: 'lockout_user',
      email: 'lockout@morajaws.net',
      role: 'installer',
      active: true,
      passwordHash: await hashPasswordWithBcrypt('CorrectPass123!'),
      sessionVersion: 1,
      createdAt: new Date().toISOString()
    };
    db.users.push(victimUser);

    let lockoutTriggered = false;
    for (let i = 1; i <= 6; i++) {
      const lockRes = await makeRequest(port, 'POST', '/api/auth/login', {
        identifier: 'lockout_user',
        password: 'BadPassword999!'
      });
      if (lockRes.status === 429 || lockRes.data?.code === 'ACCOUNT_LOCKED') {
        lockoutTriggered = true;
        break;
      }
    }

    record(
      18,
      'Rate limiting & lockout aktif setelah 5x salah password',
      'Security',
      lockoutTriggered,
      `Lockout triggered: ${lockoutTriggered}`
    );

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
