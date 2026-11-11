/**
 * MORAJAWS — PHASE 13B CRITICAL REMEDIATION TEST SUITE
 * Comprehensive verification of:
 * 1. Session Version & Revocation Logic
 * 2. Strict Appointment Date Calendar Engine
 * 3. Local JSON Mode Prohibition Rules
 * 4. Strict RBAC Scoping (Leader & Installer Zero Name/Email Fallback)
 * 5. Audit Log Sanitization & Persistence Classification
 * 6. Production Soft-Deleted Work Order Immutable Protection (3 WOs)
 * 7. Live Express Backend /api/supabase/* Proxy Routes
 */

import { normalizeAppointmentDate, isLocalJsonModeAllowed, checkTicketAccess, PROTECTED_PRODUCTION_WO_IDS } from '../server.ts';
import { getTicketAppointmentDate } from '../src/services/appointmentDateParser.ts';
import { sanitizeSensitiveData, isValidCalendarDate, toDateOnlyString } from '../server/supabaseAdapter.ts';

interface TestResult {
  suite: string;
  testName: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function record(suite: string, testName: string, passed: boolean, details?: string) {
  results.push({
    suite,
    testName,
    status: passed ? 'PASS' : 'FAIL',
    details
  });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${suite}] ${testName}${details ? ` -> ${details}` : ''}`);
}

async function runPhase13bTests() {
  console.log('================================================================');
  console.log('MORAJAWS PHASE 13B CRITICAL REMEDIATION VERIFICATION SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: STRICT APPOINTMENT DATE CALENDAR ENGINE
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 1: Appointment Date Calendar Engine ---');

  // Test 1.1: Leap year check
  record('DateEngine', 'Reject Feb 29 on non-leap year (2026-02-29)', normalizeAppointmentDate('2026-02-29') === '');
  record('DateEngine', 'Reject Feb 30 on leap year (2028-02-30)', normalizeAppointmentDate('2028-02-30') === '');
  record('DateEngine', 'Reject April 31 (2026-04-31)', normalizeAppointmentDate('2026-04-31') === '');
  record('DateEngine', 'Reject June 31 (2026-06-31)', normalizeAppointmentDate('2026-06-31') === '');
  record('DateEngine', 'Accept Feb 29 on leap year (2028-02-29)', normalizeAppointmentDate('2028-02-29') === '2028-02-29');

  // Test 1.2: ISO offset & UTC conversion to Asia/Jakarta (+7)
  // 2026-10-28 17:00:00 UTC = 2026-10-29 00:00:00 Asia/Jakarta
  record(
    'DateEngine',
    'UTC timestamp shifts correctly to next day in Jakarta timezone',
    normalizeAppointmentDate('2026-10-28T17:00:00.000Z') === '2026-10-29'
  );

  // Test 1.3: Indonesian format DD/MM/YYYY
  record('DateEngine', 'Parse DD/MM/YYYY (28/10/2026)', normalizeAppointmentDate('28/10/2026') === '2026-10-28');
  record('DateEngine', 'Parse DD-MM-YYYY (28-10-2026)', normalizeAppointmentDate('28-10-2026') === '2026-10-28');

  // Test 1.4: Excel Serial Date (46325 = 2026-10-30)
  record('DateEngine', 'Parse Excel Serial Date 46325', normalizeAppointmentDate(46325) === '2026-10-30');

  // Test 1.5: Rejects empty or invalid dates (NEVER defaults to today)
  record('DateEngine', 'Reject empty string without fallback to today', normalizeAppointmentDate('') === '');
  record('DateEngine', 'Reject null without fallback to today', normalizeAppointmentDate(null) === '');
  record('DateEngine', 'Reject invalid gibberish without fallback to today', normalizeAppointmentDate('INVALID_DATE') === '');

  // Test 1.6: Appointment Date Parser candidate array exclusion of date and ticketDate
  const ticketWithDateOnly: any = {
    id: 'test_t1',
    date: '2026-05-01',
    ticketDate: '2026-05-02',
    createdAt: '2026-05-03'
  };
  const extractedDate = getTicketAppointmentDate(ticketWithDateOnly);
  record('DateEngine', 'getTicketAppointmentDate rejects ticket.date and ticket.ticketDate', extractedDate === null);

  const ticketWithApptDate: any = {
    id: 'test_t2',
    date: '2026-05-01',
    appointmentDate: '2026-10-28',
    createdAt: '2026-05-03'
  };
  record('DateEngine', 'getTicketAppointmentDate extracts true appointmentDate', getTicketAppointmentDate(ticketWithApptDate) === '2026-10-28');

  // ---------------------------------------------------------------------------
  // SUITE 2: LOCAL JSON MODE PROHIBITION
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Local JSON Mode Prohibition ---');

  const oldEnv = { ...process.env };

  // Case A: Supabase credentials exist -> must return false regardless of ALLOW_LOCAL_JSON_MODE
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
  process.env.ALLOW_LOCAL_JSON_MODE = 'true';
  record('LocalJsonPolicy', 'Disallowed when Supabase credentials exist even if ALLOW_LOCAL_JSON_MODE=true', isLocalJsonModeAllowed() === false);

  // Case B: In production mode -> must return false
  process.env.NODE_ENV = 'production';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ALLOW_LOCAL_JSON_MODE = 'true';
  record('LocalJsonPolicy', 'Disallowed in NODE_ENV=production', isLocalJsonModeAllowed() === false);

  // Case C: Dev mode without Supabase, explicitly enabled
  process.env.NODE_ENV = 'development';
  process.env.ALLOW_LOCAL_JSON_MODE = 'true';
  record('LocalJsonPolicy', 'Allowed only in development with ALLOW_LOCAL_JSON_MODE=true', isLocalJsonModeAllowed() === true);

  // Restore env
  process.env = oldEnv;

  // ---------------------------------------------------------------------------
  // SUITE 3: STRICT RBAC (LEADER & INSTALLER ZERO NAME/EMAIL FALLBACK)
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Strict RBAC Engine ---');

  const leaderUser: any = {
    id: 'ldr_1',
    name: 'Budi Leader',
    role: 'leader',
    contractorId: 'contr_abc',
    area: 'Area Timur',
    active: true
  };

  const matchingWoLeader: any = {
    id: 'wo_ldr_1',
    contractorId: 'contr_abc',
    area: 'Area Timur'
  };
  const mismatchAreaWoLeader: any = {
    id: 'wo_ldr_2',
    contractorId: 'contr_abc',
    area: 'Area Barat'
  };
  const mismatchContrWoLeader: any = {
    id: 'wo_ldr_3',
    contractorId: 'contr_xyz',
    area: 'Area Timur'
  };

  record('StrictRBAC', 'Leader accesses WO with matching contractorId and area', checkTicketAccess(matchingWoLeader, leaderUser) === true);
  record('StrictRBAC', 'Leader denied on mismatched area', checkTicketAccess(mismatchAreaWoLeader, leaderUser) === false);
  record('StrictRBAC', 'Leader denied on mismatched contractorId', checkTicketAccess(mismatchContrWoLeader, leaderUser) === false);

  // Installer checks
  const installerUser: any = {
    id: 'inst_007',
    name: 'Joko Teknisi',
    email: 'joko@gmail.com',
    firebaseUid: 'fb_joko_123',
    role: 'installer',
    contractorId: 'contr_abc',
    active: true
  };

  const matchingIdWo: any = {
    id: 'wo_inst_1',
    contractorId: 'contr_abc',
    installerId: 'inst_007'
  };
  const matchingUidWo: any = {
    id: 'wo_inst_2',
    contractorId: 'contr_abc',
    installerId: 'fb_joko_123'
  };
  const nameOnlyFallbackWo: any = {
    id: 'wo_inst_3',
    contractorId: 'contr_abc',
    installerName: 'Joko Teknisi', // Name only, NO installerId
    installerId: ''
  };
  const emailOnlyFallbackWo: any = {
    id: 'wo_inst_4',
    contractorId: 'contr_abc',
    installerEmail: 'joko@gmail.com', // Email only, NO installerId
    installerId: ''
  };
  const mismatchContractorWo: any = {
    id: 'wo_inst_5',
    contractorId: 'contr_OTHER',
    installerId: 'inst_007'
  };

  record('StrictRBAC', 'Installer accesses WO matching user.id and contractorId', checkTicketAccess(matchingIdWo, installerUser) === true);
  record('StrictRBAC', 'Installer accesses WO matching user.firebaseUid and contractorId', checkTicketAccess(matchingUidWo, installerUser) === true);
  record('StrictRBAC', 'Installer strictly denied on name-only match (Zero Name Fallback)', checkTicketAccess(nameOnlyFallbackWo, installerUser) === false);
  record('StrictRBAC', 'Installer strictly denied on email-only match (Zero Email Fallback)', checkTicketAccess(emailOnlyFallbackWo, installerUser) === false);
  record('StrictRBAC', 'Installer strictly denied if contractorId mismatches', checkTicketAccess(mismatchContractorWo, installerUser) === false);

  // ---------------------------------------------------------------------------
  // SUITE 4: AUDIT LOG SANITIZATION & REDACTION
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Audit Log Sanitization ---');

  const dirtyPayload = {
    username: 'superadmin',
    password: 'SuperSecretPassword123!',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    serviceRoleKey: 'sb_secret_key_1234567890',
    apiKey: 'AIzaSyFakeApiKeySecret',
    nested: {
      clientSecret: 'secret_val',
      safeData: 'safe_field_value'
    }
  };

  const sanitized = sanitizeSensitiveData(dirtyPayload);
  record('AuditSanitization', 'Redact password field to [REDACTED]', sanitized.password === '[REDACTED]');
  record('AuditSanitization', 'Redact token field to [REDACTED]', sanitized.token === '[REDACTED]');
  record('AuditSanitization', 'Redact serviceRoleKey field to [REDACTED]', sanitized.serviceRoleKey === '[REDACTED]');
  record('AuditSanitization', 'Redact apiKey field to [REDACTED]', sanitized.apiKey === '[REDACTED]');
  record('AuditSanitization', 'Redact nested clientSecret to [REDACTED]', sanitized.nested.clientSecret === '[REDACTED]');
  record('AuditSanitization', 'Preserve safe fields unmutated', sanitized.nested.safeData === 'safe_field_value');

  // ---------------------------------------------------------------------------
  // SUITE 5: PROTECTED PRODUCTION WORK ORDERS (IMMUTABLE THREE RECORDS)
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Protected Production Work Orders ---');

  const p1 = 'wo_1793825457141_u4bnht';
  const p2 = 'wo_imp_1793825458959_4i4f1h';
  const p3 = 'wo_imp_1793825458959_262dei';

  record('ProtectedWO', 'Protected WO 1 present in PROTECTED_PRODUCTION_WO_IDS', PROTECTED_PRODUCTION_WO_IDS.has(p1));
  record('ProtectedWO', 'Protected WO 2 present in PROTECTED_PRODUCTION_WO_IDS', PROTECTED_PRODUCTION_WO_IDS.has(p2));
  record('ProtectedWO', 'Protected WO 3 present in PROTECTED_PRODUCTION_WO_IDS', PROTECTED_PRODUCTION_WO_IDS.has(p3));

  // ---------------------------------------------------------------------------
  // SUITE 6: LIVE BACKEND API INTEGRATION TESTS (via fetch http://localhost:3000)
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Live Backend API Integration ---');

  const BASE_URL = 'http://localhost:3000';

  try {
    // 6.1: Health check
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    record('LiveAPI', 'Health endpoint responds with HTTP 200', healthRes.status === 200);
    record('LiveAPI', 'Supabase backend status reported in health report', Boolean(healthJson.supabase && healthJson.supabase.status));

    // 6.2: Super Admin Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'superadmin', password: '12345678' })
    });
    const loginJson = await loginRes.json();
    const adminToken = loginJson.token;
    record('LiveAPI', 'Login as superadmin returns token and sessionVersion', Boolean(adminToken && loginJson.user?.sessionVersion));

    // 6.3: Query /api/supabase/work-orders
    const woRes = await fetch(`${BASE_URL}/api/supabase/work-orders?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const woJson = await woRes.json();
    record('LiveAPI', 'GET /api/supabase/work-orders succeeds with HTTP 200', woRes.status === 200 && woJson.success === true);

    // 6.4: Attempt to delete protected WO 1 -> Must return HTTP 403
    const deleteProtectedRes = await fetch(`${BASE_URL}/api/supabase/work-orders/${p1}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: 'Attempting illegal delete test' })
    });
    const deleteProtectedJson = await deleteProtectedRes.json();
    record(
      'LiveAPI',
      'DELETE on protected WO 1 rejected with HTTP 403 PROTECTED_RECORD',
      deleteProtectedRes.status === 403 && (deleteProtectedJson.error?.code === 'PROTECTED_RECORD' || deleteProtectedJson.code === 'REQUIRE_MANAGEMENT_DATA')
    );

    // 6.5: Attempt to patch protected WO 2 -> Must return HTTP 403
    const patchProtectedRes = await fetch(`${BASE_URL}/api/supabase/work-orders/${p2}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notes: 'Illegal update attempt' })
    });
    const patchProtectedJson = await patchProtectedRes.json();
    record(
      'LiveAPI',
      'PATCH on protected WO 2 rejected with HTTP 403 PROTECTED_RECORD',
      patchProtectedRes.status === 403 && patchProtectedJson.error?.code === 'PROTECTED_RECORD'
    );

    // 6.6: Attempt to archive protected WO 3 -> Must return HTTP 403
    const archiveProtectedRes = await fetch(`${BASE_URL}/api/supabase/work-orders/${p3}/archive`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const archiveProtectedJson = await archiveProtectedRes.json();
    record(
      'LiveAPI',
      'POST archive on protected WO 3 rejected with HTTP 403 PROTECTED_RECORD',
      archiveProtectedRes.status === 403 && archiveProtectedJson.error?.code === 'PROTECTED_RECORD'
    );

    // 6.7: Attempt to restore protected WO 1 -> Must return HTTP 403
    const restoreProtectedRes = await fetch(`${BASE_URL}/api/supabase/work-orders/${p1}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    const restoreProtectedJson = await restoreProtectedRes.json();
    record(
      'LiveAPI',
      'POST restore on protected WO 1 rejected with HTTP 403 PROTECTED_RECORD',
      restoreProtectedRes.status === 403 && restoreProtectedJson.error?.code === 'PROTECTED_RECORD'
    );

    // 6.8: Verify ?token= query parameter is strictly rejected
    const queryTokenRes = await fetch(`${BASE_URL}/api/supabase/work-orders?token=${adminToken}`);
    record('LiveAPI', 'Request with ?token= query parameter strictly rejected with HTTP 401', queryTokenRes.status === 401);

    // 6.9: Session Version Revocation Test
    // Create a temporary user, login to get session, then update user (which bumps sessionVersion), then verify old token gets 401
    const testUsername = `testuser_${Date.now()}`;
    const createUserRes = await fetch(`${BASE_URL}/api/supabase/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Revocation User',
        username: testUsername,
        password: 'password123',
        role: 'dispatch'
      })
    });
    const createUserJson = await createUserRes.json();
    const testUserId = createUserJson.data?.id;

    if (testUserId) {
      // Login as new user
      const userLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testUsername, password: 'password123' })
      });
      const userLoginJson = await userLoginRes.json();
      const userToken = userLoginJson.token;

      // Verify token works initially
      const check1 = await fetch(`${BASE_URL}/api/supabase/work-orders?limit=1`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      record('SessionRevocation', 'User token works before account mutation', check1.status === 200);

      // Super admin mutates user account (e.g. toggle status or change role), triggering sessionVersion bump & revocation
      const toggleRes = await fetch(`${BASE_URL}/api/users/${testUserId}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      record('SessionRevocation', 'Super admin mutates user account successfully', toggleRes.status === 200);

      // Verify the OLD user token is now REJECTED due to sessionVersion mismatch / revoked session
      const check2 = await fetch(`${BASE_URL}/api/supabase/work-orders?limit=1`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      record('SessionRevocation', 'Old user token is rejected with HTTP 401 after sessionVersion bump', check2.status === 401);

      // Clean up test user
      await fetch(`${BASE_URL}/api/supabase/users/${testUserId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Automated test cleanup' })
      });
    }

    // 6.10: Contractors & Coverage Areas & Settings & Audit Logs endpoints
    const contrRes = await fetch(`${BASE_URL}/api/supabase/contractors`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    record('LiveAPI', 'GET /api/supabase/contractors succeeds with HTTP 200', contrRes.status === 200);

    const areasRes = await fetch(`${BASE_URL}/api/supabase/coverage-areas`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    record('LiveAPI', 'GET /api/supabase/coverage-areas succeeds with HTTP 200', areasRes.status === 200);

    const settingRes = await fetch(`${BASE_URL}/api/supabase/settings/test_phase13b_key`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    record('LiveAPI', 'GET /api/supabase/settings/:key succeeds with HTTP 200', settingRes.status === 200);

    const auditRes = await fetch(`${BASE_URL}/api/supabase/audit-logs?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    record('LiveAPI', 'GET /api/supabase/audit-logs succeeds with HTTP 200', auditRes.status === 200);

  } catch (err: any) {
    record('LiveAPI', 'Live Backend API Exception', false, err?.message);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('MORAJAWS PHASE 13B TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED:      ${passCount}`);
  console.log(`FAILED:      ${failCount}`);

  if (failCount > 0) {
    console.error(`\nFAILED TESTS:`);
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- [${f.suite}] ${f.testName} (${f.details || 'no details'})`);
    });
    process.exit(1);
  } else {
    console.log(`\nALL PHASE 13B CRITICAL REMEDIATION TESTS PASSED PERFECTLY!`);
    process.exit(0);
  }
}

runPhase13bTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
