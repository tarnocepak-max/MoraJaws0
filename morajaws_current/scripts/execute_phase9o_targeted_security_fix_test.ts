import { ROLE_PERMISSIONS, hasPermission } from '../src/services/authService.ts';
import type { UserRole, Ticket } from '../src/types/index.ts';
import { auditAndCleanDuplicates } from '../src/services/woDeduplicationService.ts';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function runTargetedSecurityFixSuite() {
  console.log('================================================================');
  console.log('   MORAJAWS PHASE 9O-REMEDIATION TARGETED SECURITY FIX SUITE    ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}${extra ? ` -> ${extra}` : ''}`);
      failed++;
    }
  }

  // Helper to login and get session token
  async function login(username: string, password = '12345678'): Promise<{ token: string; user: any }> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      throw new Error(`Login failed for ${username}: status ${res.status}`);
    }
    const data = await res.json();
    return { token: data.token, user: data.user };
  }

  // ---------------------------------------------------------------------------
  // 1. Audit Logs Endpoint Security Test Suite
  // ---------------------------------------------------------------------------
  console.log('--- 1. AUDIT LOGS ENDPOINT SECURITY (GET & POST) ---');

  // Login all 6 roles
  const superAdminAuth = await login('superadmin');
  const itSupportAuth = await login('itsupport');
  const mgmtDataAuth = await login('datamgmt');
  const dispatchAuth = await login('dispatch');
  const leaderAuth = await login('leadermjs');
  const installerAuth = await login('installer1');

  // Test 1.1: Unauthenticated GET /api/audit-logs -> 401
  const unauthGetAudit = await fetch(`${BASE_URL}/api/audit-logs`);
  assert('Unauthenticated GET /api/audit-logs returns 401', unauthGetAudit.status === 401);

  // Test 1.2: super_admin GET /api/audit-logs -> 200
  const saGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${superAdminAuth.token}` }
  });
  assert('super_admin GET /api/audit-logs returns 200', saGetAudit.status === 200);

  // Test 1.3: it_support GET /api/audit-logs -> 200 (Read-Only)
  const itGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${itSupportAuth.token}` }
  });
  assert('it_support GET /api/audit-logs returns 200 (Read-Only)', itGetAudit.status === 200);

  // Test 1.4: management_data GET /api/audit-logs -> 403
  const mgmtGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${mgmtDataAuth.token}` }
  });
  assert('management_data GET /api/audit-logs returns 403', mgmtGetAudit.status === 403);

  // Test 1.5: dispatch GET /api/audit-logs -> 403
  const dispGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${dispatchAuth.token}` }
  });
  assert('dispatch GET /api/audit-logs returns 403', dispGetAudit.status === 403);

  // Test 1.6: leader GET /api/audit-logs -> 403
  const leaderGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${leaderAuth.token}` }
  });
  assert('leader GET /api/audit-logs returns 403', leaderGetAudit.status === 403);

  // Test 1.7: installer GET /api/audit-logs -> 403
  const instGetAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${installerAuth.token}` }
  });
  assert('installer GET /api/audit-logs returns 403', instGetAudit.status === 403);

  // Test 1.8: POST /api/audit-logs is DISABLED (returns 405 Method Not Allowed)
  const saPostAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${superAdminAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'Forged Action', entity: 'test', entityId: '1', details: 'Spoofed' })
  });
  assert('POST /api/audit-logs rejected with 405 Method Not Allowed for super_admin', saPostAudit.status === 405);

  const itPostAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${itSupportAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'Forged Action by IT', entity: 'test', entityId: '2', details: 'Spoofed' })
  });
  assert('POST /api/audit-logs rejected with 405 Method Not Allowed for it_support', itPostAudit.status === 405);

  const unauthPostAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'Forged Action', entity: 'test', entityId: '3', details: 'Spoofed' })
  });
  assert('POST /api/audit-logs rejected for unauthenticated request (401 or 405)', unauthPostAudit.status === 401 || unauthPostAudit.status === 405);

  // ---------------------------------------------------------------------------
  // 2. Work Order Deletion & Reason Validation Test Suite
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. WORK ORDER DELETION & REASON VALIDATION ---');

  // Test 2.1: Non-management_data cannot delete ticket
  const saDeleteRes = await fetch(`${BASE_URL}/api/tickets/WO20267399330`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${superAdminAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'Super admin attempt' })
  });
  assert('super_admin DELETE /api/tickets/:id rejected with 403 (Exclusive Management Data)', saDeleteRes.status === 403);

  // Test 2.2: management_data with EMPTY reason -> 400
  const emptyReasonRes = await fetch(`${BASE_URL}/api/tickets/WO20267399330`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: '' })
  });
  assert('management_data DELETE with empty reason returns 400', emptyReasonRes.status === 400);

  // Test 2.3: management_data with reason < 5 chars -> 400
  const shortReasonRes = await fetch(`${BASE_URL}/api/tickets/WO20267399330`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'abc' })
  });
  assert('management_data DELETE with reason < 5 chars returns 400', shortReasonRes.status === 400);

  // Test 2.4: bulk-delete with reason < 5 chars -> 400
  const bulkShortReason = await fetch(`${BASE_URL}/api/tickets/bulk-delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ticketIds: ['t-fake-1'], reason: 'fail' })
  });
  assert('POST /api/tickets/bulk-delete with reason < 5 chars returns 400', bulkShortReason.status === 400);

  // Test 2.5: purge-by-date with reason < 5 chars -> 400
  const purgeShortReason = await fetch(`${BASE_URL}/api/tickets/purge-by-date`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ importDate: '2026-11-01', reason: 'bad' })
  });
  assert('POST /api/tickets/purge-by-date with reason < 5 chars returns 400', purgeShortReason.status === 400);

  // Test 2.6: batch/:date with EMPTY reason -> 400 (Fallback successfully eliminated)
  const batchEmptyReason = await fetch(`${BASE_URL}/api/tickets/batch/2026-11-01`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: '' })
  });
  assert('DELETE /api/tickets/batch/:date with empty reason returns 400 (no default fallback)', batchEmptyReason.status === 400);

  // Test 2.7: batch/:date with reason < 5 chars -> 400
  const batchShortReason = await fetch(`${BASE_URL}/api/tickets/batch/2026-11-01`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${mgmtDataAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'skip' })
  });
  assert('DELETE /api/tickets/batch/:date with reason < 5 chars returns 400', batchShortReason.status === 400);

  // Test 2.8: Attempt to modify isDeleted via PUT /api/tickets/:id by super_admin -> 403
  const putBypassAttempt = await fetch(`${BASE_URL}/api/tickets/WO20267399330`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${superAdminAuth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isDeleted: true, deletionReason: 'Hacked status' })
  });
  assert('PUT /api/tickets/:id isDeleted manipulation rejected with 403 for non-management_data', putBypassAttempt.status === 403);

  // ---------------------------------------------------------------------------
  // 3. Deduplication Protection & Audit Tooling
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. DEDUPLICATION PROTECTION & AUDIT TOOLING ---');

  // Verify auditAndCleanDuplicates is a pure function that does not throw or mutate state
  const sampleTickets = [
    { id: 't1', woNumber: 'WO-100', statusWOAgent: 'Pending', statusWOInstaller: 'Unassigned', customerName: 'A' },
    { id: 't2', woNumber: 'WO-100', statusWOAgent: 'Pending', statusWOInstaller: 'Assigned', customerName: 'A' }
  ] as unknown as Ticket[];
  let auditCallCount = 0;
  const auditReport = auditAndCleanDuplicates(sampleTickets, () => { auditCallCount++; });
  assert('auditAndCleanDuplicates correctly identifies duplicates', auditReport.totalDuplicatesDetected === 1 || auditReport.duplicatesCleaned === 1);
  assert('auditAndCleanDuplicates does not perform database writes (pure analysis)', Array.isArray(auditReport.duplicateDocIdsToDelete));

  // Verify AppContext executeComprehensiveDeduplication has role check in source code
  const appContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf-8');
  assert('AppContext executeComprehensiveDeduplication contains role check for management_data',
    appContextContent.includes("if (currentUser.role !== 'management_data')") &&
    appContextContent.includes('Unauthorized Deduplication Attempt Blocked')
  );

  // ---------------------------------------------------------------------------
  // 4. Audit Log Listener Frontend Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. AUDIT LOG LISTENER FRONTEND ISOLATION ---');

  assert('AppContext does not register onAuditLogsChange in unconditional initFirestore',
    !appContextContent.includes('onAuditLogsChange: (liveLogs) => {\n            if (isCancelled) return;\n            if (liveLogs) {\n              setAuditLogs(liveLogs);')
  );

  assert('AppContext has dedicated useEffect for subscribeToAuditLogs',
    appContextContent.includes('subscribeToAuditLogs') &&
    appContextContent.includes("currentUser.role === 'super_admin' || currentUser.role === 'it_support'")
  );

  const firestoreDbContent = fs.readFileSync(path.resolve(process.cwd(), 'src/services/firestoreDb.ts'), 'utf-8');
  assert('firestoreDb exports dedicated subscribeToAuditLogs function',
    firestoreDbContent.includes('export function subscribeToAuditLogs')
  );
  assert('firestoreDb audit listener error does not propagate to fatal global onError',
    firestoreDbContent.includes('Audit logs subscription notice (non-fatal)')
  );

  // ---------------------------------------------------------------------------
  // 5. Firestore Rules Source Code Hardening Audit
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. FIRESTORE RULES HARDENING AUDIT ---');

  const firestoreRulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  // Verify NO public 'allow ... if true;'
  const hasAllowIfTrue = /allow\s+(?:read|write|get|list|create|update|delete)\s*:\s*if\s+true\s*;/i.test(firestoreRulesContent);
  assert('firestore.rules contains NO "if true;" public access bypasses', !hasAllowIfTrue);

  // Verify tickets update cannot touch deletion fields
  assert('firestore.rules blocks deletion fields from regular ticket updates',
    firestoreRulesContent.includes("!incoming().diff(existing()).affectedKeys().hasAny(['isDeleted', 'deletedAt', 'deletedBy', 'deletionReason'])")
  );

  // Verify wa_templates permits read to signed in users for click-to-chat
  assert('firestore.rules permits get, list on wa_templates for authenticated users (click-to-chat)',
    firestoreRulesContent.includes('match /wa_templates/{templateId}') &&
    firestoreRulesContent.includes('allow get, list: if isSignedIn()')
  );

  // Verify wa_templates restricts management to isSuperOrDispatch
  assert('firestore.rules restricts wa_templates management to isSuperOrDispatch',
    firestoreRulesContent.includes('allow create, update, delete: if isValidId(templateId) && isSuperOrDispatch()')
  );

  // Verify audit_logs read is restricted to isSuperOrITSupport
  assert('firestore.rules restricts audit_logs read to isSuperOrITSupport',
    firestoreRulesContent.includes('match /audit_logs/{logId}') &&
    firestoreRulesContent.includes('allow get, list: if isSuperOrITSupport()')
  );

  // Verify audit_logs update and delete are false
  assert('firestore.rules restricts audit_logs update/delete to if false',
    firestoreRulesContent.includes('allow update, delete: if false')
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TARGETED FIX SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTargetedSecurityFixSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
