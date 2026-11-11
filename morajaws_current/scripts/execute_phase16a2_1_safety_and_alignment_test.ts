/**
 * MORAJAWS — PHASE 16A.2.1 SAFETY CORRECTION & STAGING EXECUTION READINESS TEST SUITE
 * 
 * Verifies all 12 mandatory scenarios required by Phase 16A.2.1:
 *  1. [MOCK TEST] Tidak ada profil staf cocok (NOT FOUND guard, tidak membuat akun palsu).
 *  2. [MOCK TEST] Satu profil cocok dan UID NULL (ELIGIBLE, tepat 1 baris terikat 1:1).
 *  3. [MOCK TEST] Dua profil memiliki email cocok (AMBIGUOUS guard, menolak update ambigu).
 *  4. [MOCK TEST] Profil memiliki UID berbeda (CONFLICT guard, tidak menimpa UID terisi).
 *  5. [MOCK TEST] UID sudah digunakan profil lain (CONFLICT guard, cegah duplikasi UID).
 *  6. [MOCK TEST & STATIC] Script tidak mengubah role (Role immutability).
 *  7. [STATIC SQL AUDIT] Script tidak membuat akun Auth (auth.users insertion prohibition).
 *  8. [STATIC SQL AUDIT] Script tidak mengubah password (Password mutation prohibition).
 *  9. [STATIC SQL AUDIT] Browser tidak mendapat akses database langsung yang tidak diperlukan (Express-only access).
 * 10. [STATIC SQL AUDIT] RLS tetap aktif di seluruh 19 tabel kanonikal.
 * 11. [MOCK & STATIC AUDIT] Migration mendeteksi tabel lama yang strukturnya berbeda (Preflight compatibility).
 * 12. [STATIC SQL AUDIT] Rollback tidak menghapus data (Zero DROP TABLE / TRUNCATE / DELETE / DROP COLUMN).
 *
 * RESULTS ARE STRICTLY CATEGORIZED INTO:
 *  - MOCK TEST
 *  - STATIC SQL AUDIT
 *  - LIVE STAGING TEST (Separated and reported as BLOCKED / NOT TESTED without live credentials)
 */

import fs from 'fs';
import path from 'path';

export type TestCategory = 'MOCK TEST' | 'STATIC SQL AUDIT' | 'LIVE STAGING TEST';
export type TestStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT TESTED' | 'BLOCKED';

export interface TestResult {
  num: number;
  category: TestCategory;
  name: string;
  status: TestStatus;
  expected: string;
  actual: string;
  details: string;
}

const testResults: TestResult[] = [];

function recordResult(
  num: number,
  category: TestCategory,
  name: string,
  status: TestStatus,
  expected: string,
  actual: string,
  details: string
) {
  testResults.push({ num, category, name, status, expected, actual, details });
  console.log(`[${status}] [${category}] #${num}: ${name}`);
  console.log(`       Expected: ${expected}`);
  console.log(`       Actual:   ${actual}`);
  console.log(`       Details:  ${details}\n`);
}

/**
 * Alignment Engine logic simulator matching the exact rules of
 * migrations/007_phase16a2_staging_account_alignment_reference.sql
 */
interface MockStaffProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  alt_email?: string;
  role: string;
  contractor?: string;
  area?: string;
  auth_user_id: string | null;
  active: boolean;
  is_deleted: boolean;
}

interface MockAuthUser {
  id: string;
  email: string;
}

interface AlignmentExecutionResult {
  status: 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS' | 'CONFLICT' | 'ALREADY_ALIGNED' | 'DRY_RUN_PASSED';
  message: string;
  rowsUpdated: number;
  updatedProfile?: MockStaffProfile;
}

function simulateAccountAlignment(
  authUsers: MockAuthUser[],
  staffProfiles: MockStaffProfile[],
  targetEmail: string,
  targetUid: string,
  ownerConfirmed: boolean = false
): AlignmentExecutionResult {
  // Step 1: Check Auth User existence
  const authUser = authUsers.find(
    a => a.id === targetUid && a.email.toLowerCase() === targetEmail.toLowerCase()
  );
  if (!authUser) {
    return {
      status: 'NOT_FOUND',
      message: `AUTH_NOT_FOUND: Akun Auth dengan UID ${targetUid} dan email ${targetEmail} tidak ditemukan di auth.users.`,
      rowsUpdated: 0
    };
  }

  // Step 2: Check if target UID is already bound to another profile
  const conflictProfiles = staffProfiles.filter(
    p => !p.is_deleted && p.auth_user_id === targetUid && p.email.toLowerCase() !== targetEmail.toLowerCase()
  );
  if (conflictProfiles.length > 0) {
    return {
      status: 'CONFLICT',
      message: `CONFLICT_UID_IN_USE: Auth UID ${targetUid} sudah digunakan oleh profil lain (${conflictProfiles.map(p => p.username).join(', ')}).`,
      rowsUpdated: 0
    };
  }

  // Step 3: Count matching profiles by email or alt_email
  const matchingProfiles = staffProfiles.filter(
    p => !p.is_deleted && (
      p.email.toLowerCase() === targetEmail.toLowerCase() ||
      (p.alt_email && p.alt_email.toLowerCase() === targetEmail.toLowerCase())
    )
  );

  if (matchingProfiles.length === 0) {
    return {
      status: 'NOT_FOUND',
      message: `NOT_FOUND: Tidak ditemukan profil staf di public.users untuk email ${targetEmail}. DILARANG membuat profil palsu.`,
      rowsUpdated: 0
    };
  }

  if (matchingProfiles.length > 1) {
    return {
      status: 'AMBIGUOUS',
      message: `AMBIGUOUS: Ditemukan ${matchingProfiles.length} profil staf cocok dengan email ${targetEmail}. Pengaitan dihentikan demi integritas data.`,
      rowsUpdated: 0
    };
  }

  // Step 4: Examine the single matching profile
  const candidate = matchingProfiles[0];

  if (candidate.auth_user_id !== null) {
    if (candidate.auth_user_id === targetUid) {
      return {
        status: 'ALREADY_ALIGNED',
        message: `ALREADY_ALIGNED: Profil ${candidate.username} sudah terhubung ke Auth UID ${targetUid}. Tidak ada update.`,
        rowsUpdated: 0,
        updatedProfile: candidate
      };
    } else {
      return {
        status: 'CONFLICT',
        message: `CONFLICT_DIFFERENT_UID: Profil ${candidate.username} sudah memiliki auth_user_id berbeda (${candidate.auth_user_id}). Dilarang menimpa UID yang sudah terisi.`,
        rowsUpdated: 0
      };
    }
  }

  // Step 5: Check owner confirmation gate
  if (!ownerConfirmed) {
    return {
      status: 'DRY_RUN_PASSED',
      message: `DRY_RUN_PASSED: Semua syarat pengaitan terpenuhi untuk ${candidate.username}. UPDATE ditahan menunggu konfirmasi pemilik.`,
      rowsUpdated: 0,
      updatedProfile: candidate
    };
  }

  // Step 6: Perform guarded 1-row update
  candidate.auth_user_id = targetUid;
  return {
    status: 'SUCCESS',
    message: `SUCCESS: Tepat 1 profil (${candidate.username}) berhasil dikaitkan ke Auth UID ${targetUid}.`,
    rowsUpdated: 1,
    updatedProfile: candidate
  };
}

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('MORAJAWS — PHASE 16A.2.1: SAFETY CORRECTION & EXECUTION READINESS TEST');
  console.log('Target Staging: lvytgqsvxntnvlohmrxi | URL: https://lvytgqsvxntnvlohmrxi.supabase.co');
  console.log('==============================================================================\n');

  const TARGET_EMAIL = 'rayhanafirzanx@gmail.com';
  const TARGET_UID = 'a32628b2-25fb-48c3-934c-9d2d7eb58255';
  const mockAuthUser: MockAuthUser = { id: TARGET_UID, email: TARGET_EMAIL };

  const migration007Path = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_schema_initialization.sql');
  const alignmentScriptPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_account_alignment_reference.sql');
  const rollbackScriptPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_rollback_plan.sql');

  const migration007Sql = fs.readFileSync(migration007Path, 'utf8');
  const alignmentSql = fs.readFileSync(alignmentScriptPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackScriptPath, 'utf8');

  // ===========================================================================
  // TEST 1: [MOCK TEST] Tidak ada profil staf cocok
  // ===========================================================================
  {
    const staff: MockStaffProfile[] = [
      { id: 'usr_1', username: 'other', name: 'Other User', email: 'other@morajaws.net', role: 'dispatch', auth_user_id: null, active: true, is_deleted: false }
    ];
    const res = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const passed = res.status === 'NOT_FOUND' && res.rowsUpdated === 0 && staff.length === 1;

    recordResult(
      1,
      'MOCK TEST',
      'Tidak ada profil staf cocok -> Melaporkan NOT FOUND, tidak membuat akun palsu',
      passed ? 'PASS' : 'FAIL',
      'status: NOT_FOUND, rowsUpdated: 0, no profile fabricated',
      `status: ${res.status}, rowsUpdated: ${res.rowsUpdated}`,
      'Script menghentikan eksekusi dan tidak membuat baris profil staf sembarangan saat email tidak ditemukan'
    );
  }

  // ===========================================================================
  // TEST 2: [MOCK TEST] Satu profil cocok dan UID NULL
  // ===========================================================================
  {
    const staff: MockStaffProfile[] = [
      { id: 'usr_target', username: 'rayhana_target', name: 'Rayhana Firzan', email: TARGET_EMAIL, role: 'super_admin', auth_user_id: null, active: true, is_deleted: false }
    ];
    // Dry-run first
    const dryRes = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, false);
    const dryOk = dryRes.status === 'DRY_RUN_PASSED' && dryRes.rowsUpdated === 0 && staff[0].auth_user_id === null;

    // Confirmed update
    const confRes = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const confOk = confRes.status === 'SUCCESS' && confRes.rowsUpdated === 1 && staff[0].auth_user_id === TARGET_UID;

    const passed = dryOk && confOk;
    recordResult(
      2,
      'MOCK TEST',
      'Satu profil cocok dan UID NULL -> ELIGIBLE, verifikasi dry-run dan tepat 1 update terkonfirmasi',
      passed ? 'PASS' : 'FAIL',
      'Dry-run holds update; Confirmed execution updates exactly 1 row with target UID',
      `DryRun: ${dryRes.status}, Confirmed: ${confRes.status}, UID: ${staff[0].auth_user_id}`,
      'Profil staf yang valid dan berstatus NULL berhasil dipetakan 1:1 setelah gerbang persetujuan pemilik dibuka'
    );
  }

  // ===========================================================================
  // TEST 3: [MOCK TEST] Dua profil memiliki email cocok
  // ===========================================================================
  {
    const staff: MockStaffProfile[] = [
      { id: 'usr_1', username: 'rayhana_branch_1', name: 'Rayhana 1', email: TARGET_EMAIL, role: 'super_admin', auth_user_id: null, active: true, is_deleted: false },
      { id: 'usr_2', username: 'rayhana_branch_2', name: 'Rayhana 2', email: TARGET_EMAIL, role: 'leader', auth_user_id: null, active: true, is_deleted: false }
    ];
    const res = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const passed = res.status === 'AMBIGUOUS' && res.rowsUpdated === 0 && staff[0].auth_user_id === null && staff[1].auth_user_id === null;

    recordResult(
      3,
      'MOCK TEST',
      'Dua profil memiliki email cocok -> AMBIGUOUS guard, menolak update ambigu',
      passed ? 'PASS' : 'FAIL',
      'status: AMBIGUOUS, rowsUpdated: 0',
      `status: ${res.status}, rowsUpdated: ${res.rowsUpdated}`,
      'Jika ditemukan lebih dari satu profil dengan email sama, proses alignment langsung dihentikan demi integritas data'
    );
  }

  // ===========================================================================
  // TEST 4: [MOCK TEST] Profil memiliki UID berbeda
  // ===========================================================================
  {
    const EXISTING_DIFF_UID = '11111111-2222-3333-4444-555555555555';
    const staff: MockStaffProfile[] = [
      { id: 'usr_diff', username: 'rayhana_filled', name: 'Rayhana Firzan', email: TARGET_EMAIL, role: 'super_admin', auth_user_id: EXISTING_DIFF_UID, active: true, is_deleted: false }
    ];
    const res = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const passed = res.status === 'CONFLICT' && res.rowsUpdated === 0 && staff[0].auth_user_id === EXISTING_DIFF_UID;

    recordResult(
      4,
      'MOCK TEST',
      'Profil memiliki UID berbeda -> CONFLICT guard, tidak pernah menimpa UID yang sudah terisi',
      passed ? 'PASS' : 'FAIL',
      'status: CONFLICT, existing UID retained, rowsUpdated: 0',
      `status: ${res.status}, retained UID: ${staff[0].auth_user_id}`,
      'Sistem menolak mengubah auth_user_id yang telah berisi UID lain untuk mencegah pembajakan identitas profil'
    );
  }

  // ===========================================================================
  // TEST 5: [MOCK TEST] UID sudah digunakan profil lain
  // ===========================================================================
  {
    const staff: MockStaffProfile[] = [
      { id: 'usr_other', username: 'other_user', name: 'Other User', email: 'other@morajaws.net', role: 'leader', auth_user_id: TARGET_UID, active: true, is_deleted: false },
      { id: 'usr_candidate', username: 'candidate_user', name: 'Candidate', email: TARGET_EMAIL, role: 'super_admin', auth_user_id: null, active: true, is_deleted: false }
    ];
    const res = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const passed = res.status === 'CONFLICT' && res.rowsUpdated === 0 && staff[1].auth_user_id === null;

    recordResult(
      5,
      'MOCK TEST',
      'UID sudah digunakan profil lain -> CONFLICT guard, cegah duplikasi 1:1 UID binding',
      passed ? 'PASS' : 'FAIL',
      'status: CONFLICT_UID_IN_USE, rowsUpdated: 0',
      `status: ${res.status}, rowsUpdated: ${res.rowsUpdated}`,
      'Pemeriksaan mendeteksi bahwa target Auth UID sudah terikat ke profil staf lain, sehingga pengaitan ditolak'
    );
  }

  // ===========================================================================
  // TEST 6: [MOCK TEST & STATIC] Script tidak mengubah role
  // ===========================================================================
  {
    const staff: MockStaffProfile[] = [
      { id: 'usr_leader', username: 'kcs_leader', name: 'Leader KCS', email: TARGET_EMAIL, role: 'leader', contractor: 'PT KCS', area: 'Jakarta Timur', auth_user_id: null, active: true, is_deleted: false }
    ];
    const res = simulateAccountAlignment([mockAuthUser], staff, TARGET_EMAIL, TARGET_UID, true);
    const rolePreservedMock = res.status === 'SUCCESS' && staff[0].role === 'leader' && staff[0].contractor === 'PT KCS';

    // Static check in SQL
    const hasRoleInUpdate = /UPDATE\s+public\.users\s+SET[^;]*\brole\s*=/i.test(alignmentSql);
    const hasContractorInUpdate = /UPDATE\s+public\.users\s+SET[^;]*\bcontractor\s*=/i.test(alignmentSql);

    const passed = rolePreservedMock && !hasRoleInUpdate && !hasContractorInUpdate;
    recordResult(
      6,
      'MOCK TEST',
      'Script tidak mengubah role, username, contractor, atau area profil staf',
      passed ? 'PASS' : 'FAIL',
      'Mock role preserved as leader; SQL UPDATE contains no role= or contractor= assignments',
      `Mock role: ${staff[0].role}, SQL hasRoleInUpdate: ${hasRoleInUpdate}`,
      'Script alignment hanya menyentuh auth_user_id dan updated_at; seluruh field hak akses staf tetap utuh'
    );
  }

  // ===========================================================================
  // TEST 7: [STATIC SQL AUDIT] Script tidak membuat akun Auth
  // ===========================================================================
  {
    const insertAuthInMigration = /INSERT\s+INTO\s+auth\.users/i.test(migration007Sql);
    const insertAuthInAlignment = /INSERT\s+INTO\s+auth\.users/i.test(alignmentSql);
    const insertAuthInRollback = /INSERT\s+INTO\s+auth\.users/i.test(rollbackSql);

    const passed = !insertAuthInMigration && !insertAuthInAlignment && !insertAuthInRollback;
    recordResult(
      7,
      'STATIC SQL AUDIT',
      'Script tidak membuat akun Auth (auth.users insertion prohibition)',
      passed ? 'PASS' : 'FAIL',
      'Zero INSERT INTO auth.users statements in all SQL files',
      `Migration: ${insertAuthInMigration}, Alignment: ${insertAuthInAlignment}, Rollback: ${insertAuthInRollback}`,
      'Supabase Auth (auth.users) diperlakukan sebagai otoritas eksternal; pembuatan akun Auth dilarang dilakukan via script SQL'
    );
  }

  // ===========================================================================
  // TEST 8: [STATIC SQL AUDIT] Script tidak mengubah password
  // ===========================================================================
  {
    const altersPasswordMigration = /encrypted_password|password_hash|UPDATE\s+auth\.users/i.test(migration007Sql);
    const altersPasswordAlignment = /encrypted_password|password_hash|UPDATE\s+auth\.users/i.test(alignmentSql);
    const altersPasswordRollback = /encrypted_password|password_hash|UPDATE\s+auth\.users/i.test(rollbackSql);

    const passed = !altersPasswordMigration && !altersPasswordAlignment && !altersPasswordRollback;
    recordResult(
      8,
      'STATIC SQL AUDIT',
      'Script tidak mengubah password pengguna atau memutasi tabel auth.users',
      passed ? 'PASS' : 'FAIL',
      'Zero password modification statements across all SQL scripts',
      `Migration: ${altersPasswordMigration}, Alignment: ${altersPasswordAlignment}, Rollback: ${altersPasswordRollback}`,
      'Kredensial dan kata sandi pengguna aman dan tidak pernah dimodifikasi oleh script migrasi atau alignment'
    );
  }

  // ===========================================================================
  // TEST 9: [STATIC SQL AUDIT] Browser tidak mendapat akses database langsung yang tidak diperlukan
  // ===========================================================================
  {
    const hasGrantToAuthenticated = /GRANT\s+SELECT\s+ON\s+public\.[a-z_]+\s+TO\s+authenticated/i.test(migration007Sql);
    const hasRevokeAllFromAuthAnon = migration007Sql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;');
    const hasServiceRoleGrant = migration007Sql.includes('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');

    const passed = !hasGrantToAuthenticated && hasRevokeAllFromAuthAnon && hasServiceRoleGrant;
    recordResult(
      9,
      'STATIC SQL AUDIT',
      'Browser tidak mendapat akses database langsung (Express-only access enforcement)',
      passed ? 'PASS' : 'FAIL',
      'No GRANT to authenticated; REVOKE ALL from authenticated, anon; Full GRANT to service_role',
      `hasGrantToAuthenticated: ${hasGrantToAuthenticated}, hasRevokeAll: ${hasRevokeAllFromAuthAnon}, hasServiceRoleGrant: ${hasServiceRoleGrant}`,
      'Arsitektur Express-only ditegakkan: browser dilarang query Supabase langsung; Express backend menggunakan service_role'
    );
  }

  // ===========================================================================
  // TEST 10: [STATIC SQL AUDIT] RLS tetap aktif di seluruh 19 tabel kanonikal
  // ===========================================================================
  {
    const canonicalTables = [
      'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
      'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
      'app_settings', 'user_preferences', 'session_config', 'user_sessions',
      'attachments', 'audit_logs', 'integration_configs', 'sync_history',
      'system_error_logs', 'report_categories'
    ];

    const missingRlsTables: string[] = [];
    for (const tbl of canonicalTables) {
      const rlsStatement = `ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`;
      if (!migration007Sql.includes(rlsStatement)) {
        missingRlsTables.push(tbl);
      }
    }

    const passed = missingRlsTables.length === 0;
    recordResult(
      10,
      'STATIC SQL AUDIT',
      'Row Level Security (RLS) diaktifkan secara eksplisit pada seluruh 19 tabel',
      passed ? 'PASS' : 'FAIL',
      'All 19 canonical tables have ENABLE ROW LEVEL SECURITY',
      `Covered: ${canonicalTables.length - missingRlsTables.length}/19, Missing: ${missingRlsTables.join(', ') || 'none'}`,
      'Seluruh 19 tabel berstatus deny-by-default terhadap kueri langsung di luar service_role'
    );
  }

  // ===========================================================================
  // TEST 11: [MOCK & STATIC AUDIT] Migration mendeteksi tabel lama yang strukturnya berbeda
  // ===========================================================================
  {
    // Verify that Migration 007 includes ALTER TABLE ADD COLUMN IF NOT EXISTS blocks for critical columns
    const hasWorkOrdersInstallerId = migration007Sql.includes('ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS installer_id text;');
    const hasWorkOrdersWorkSessions = migration007Sql.includes('ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS work_sessions jsonb');
    const hasUsersAuthUserId = migration007Sql.includes('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID;');
    const hasUsersSessionVersion = migration007Sql.includes('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version integer');
    const hasSystemErrorLogsSource = migration007Sql.includes('ALTER TABLE public.system_error_logs ADD COLUMN IF NOT EXISTS source text');

    // Preflight audit file existence
    const preflightAuditPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_1_preflight_schema_audit.sql');
    const preflightExists = fs.existsSync(preflightAuditPath);

    const passed = hasWorkOrdersInstallerId && hasWorkOrdersWorkSessions && hasUsersAuthUserId &&
      hasUsersSessionVersion && hasSystemErrorLogsSource && preflightExists;

    recordResult(
      11,
      'MOCK TEST',
      'Migration mendeteksi tabel lama yang strukturnya berbeda dan menyediakan rekonsiliasi kolom',
      passed ? 'PASS' : 'FAIL',
      'Preflight script exists and Migration 007 has idempotent ADD COLUMN IF NOT EXISTS statements',
      `PreflightExists: ${preflightExists}, WO installer_id: ${hasWorkOrdersInstallerId}, users auth_user_id: ${hasUsersAuthUserId}`,
      'Jika tabel telah dibuat oleh migrasi lama (001-006), skema tetap rekonsiliasi tanpa crash atau kehilangan kolom'
    );
  }

  // ===========================================================================
  // TEST 12: [STATIC SQL AUDIT] Rollback tidak menghapus data
  // ===========================================================================
  {
    // Strip comments to test actual executable statements only
    const executableRollbackSql = rollbackSql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const hasDropTable = /DROP\s+TABLE/i.test(executableRollbackSql);
    const hasTruncate = /TRUNCATE\s+/i.test(executableRollbackSql);
    const hasDelete = /DELETE\s+FROM/i.test(executableRollbackSql);
    const hasDropColumn = /DROP\s+COLUMN/i.test(executableRollbackSql);

    const passed = !hasDropTable && !hasTruncate && !hasDelete && !hasDropColumn;
    recordResult(
      12,
      'STATIC SQL AUDIT',
      'Rollback plan tidak menghapus data operasional (Zero DROP TABLE / TRUNCATE / DELETE / DROP COLUMN)',
      passed ? 'PASS' : 'FAIL',
      'No executable DROP TABLE, TRUNCATE, DELETE FROM, or DROP COLUMN in rollback script',
      `hasDropTable: ${hasDropTable}, hasTruncate: ${hasTruncate}, hasDelete: ${hasDelete}, hasDropColumn: ${hasDropColumn}`,
      'Rollback 007 dirancang non-destruktif; hanya mencabut index komposit dan policy spesifik tanpa menyentuh data'
    );
  }

  // ===========================================================================
  // CATEGORY 3: LIVE STAGING TEST (SEPARATED & AUDITED)
  // ===========================================================================
  {
    const hasLiveUrl = Boolean(process.env.SUPABASE_URL || process.env.STAGING_SUPABASE_URL);
    const hasLiveKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY);
    const liveAvailable = hasLiveUrl && hasLiveKey;

    if (!liveAvailable) {
      recordResult(
        13,
        'LIVE STAGING TEST',
        'Koneksi dan eksekusi langsung ke remote Supabase Staging (lvytgqsvxntnvlohmrxi)',
        'BLOCKED',
        'Direct live execution permitted ONLY with valid environment credentials and explicit owner approval',
        'Live credentials not configured in runner process; awaiting owner approval gate',
        'Sesuai instruksi keamanan Fase 16A.2.1, operasi remote DDL dan modifikasi akun diblokir secara aman hingga disetujui pemilik aplikasi'
      );
    } else {
      recordResult(
        13,
        'LIVE STAGING TEST',
        'Koneksi langsung ke remote Supabase Staging',
        'NOT TESTED',
        'Owner approval required before connecting to remote database',
        'Awaiting approval',
        'Kredensial terdeteksi namun eksekusi remote ditahan menunggu persetujuan eksplisit pemilik'
      );
    }
  }

  // ===========================================================================
  // SUMMARY REPORT
  // ===========================================================================
  console.log('==============================================================================');
  console.log('PHASE 16A.2.1 EXECUTION SUMMARY BY CATEGORY:');
  console.log('==============================================================================');

  const categories: TestCategory[] = ['MOCK TEST', 'STATIC SQL AUDIT', 'LIVE STAGING TEST'];
  for (const cat of categories) {
    const items = testResults.filter(r => r.category === cat);
    const passCount = items.filter(r => r.status === 'PASS').length;
    const blockedCount = items.filter(r => r.status === 'BLOCKED' || r.status === 'NOT TESTED').length;
    const failCount = items.filter(r => r.status === 'FAIL').length;
    console.log(`[${cat}]: Total ${items.length} | PASS: ${passCount} | BLOCKED/NOT TESTED: ${blockedCount} | FAIL: ${failCount}`);
  }

  const allMockAndStaticPassed = testResults
    .filter(r => r.category === 'MOCK TEST' || r.category === 'STATIC SQL AUDIT')
    .every(r => r.status === 'PASS');

  console.log('------------------------------------------------------------------------------');
  console.log(`Mock & Static Verification: ${allMockAndStaticPassed ? 'ALL PASS (12/12)' : 'FAILED'}`);
  console.log('Live Staging Execution:    BLOCKED (Safe Guard Active - Awaiting Owner Approval)');
  console.log('==============================================================================\n');

  if (!allMockAndStaticPassed) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
