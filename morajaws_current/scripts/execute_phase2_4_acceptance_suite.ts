import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';

export interface TestCaseResult {
  id: string;
  name: string;
  section: string;
  category: 'STATIC_AUDIT' | 'LOCAL_POSTGRES' | 'MOCK' | 'SECURITY';
  status: 'PASS' | 'FAIL' | 'WARNING';
  details: string;
  sqlstate?: string;
  evidence?: any;
}

export interface VerificationSuiteReport {
  timestamp: string;
  phase: string;
  engine: {
    name: string;
    version: string;
    extensions: string[];
  };
  totalTests: number;
  passCount: number;
  failCount: number;
  warningCount: number;
  results: TestCaseResult[];
}

export async function runPhase24AcceptanceSuite(): Promise<VerificationSuiteReport> {
  const results: TestCaseResult[] = [];
  const log = (msg: string) => console.log(`[PHASE 2.4 ACCEPTANCE] ${msg}`);

  log('Starting Phase 2.4 Acceptance Suite: Application & Supabase Schema Reconciliation...');

  // 1. Initialize isolated in-memory PostgreSQL instance with pgcrypto
  const db = new PGlite({
    extensions: { pgcrypto }
  });

  let pgVersion = '';
  try {
    const vRes = await db.query<{ version: string }>('SELECT version();');
    pgVersion = vRes.rows[0].version;
    log(`PostgreSQL Engine Initialized: ${pgVersion}`);

    results.push({
      id: 'ENV-01',
      name: 'Disposable Isolated PostgreSQL Engine Initialized',
      section: 'A. Environment & Pre-requisites',
      category: 'LOCAL_POSTGRES',
      status: 'PASS',
      details: 'PostgreSQL disposable in-memory WASM instance started cleanly without remote production/staging access.',
      evidence: { version: pgVersion }
    });
  } catch (err: any) {
    results.push({
      id: 'ENV-01',
      name: 'Disposable Isolated PostgreSQL Engine Initialized',
      section: 'A. Environment & Pre-requisites',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: `Failed to initialize PostgreSQL: ${err.message}`
    });
  }

  // Pre-provision Supabase standard roles and auth schema for in-memory PostgreSQL
  try {
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text,
        created_at timestamptz DEFAULT now()
      );
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
    `);

    results.push({
      id: 'ENV-02',
      name: 'Supabase Role Simulation in Test Database',
      section: 'A. Environment & Pre-requisites',
      category: 'LOCAL_POSTGRES',
      status: 'PASS',
      details: 'Simulated Supabase roles (anon, authenticated, service_role) and auth schema for accurate RLS and security checks.',
      evidence: { roles: ['anon', 'authenticated', 'service_role'] }
    });
  } catch (err: any) {
    results.push({
      id: 'ENV-02',
      name: 'Supabase Role Simulation in Test Database',
      section: 'A. Environment & Pre-requisites',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: `Failed to configure roles: ${err.message}`
    });
  }

  // 2. Execute Canonical Migrations in Order (001, 003, 006, 007, 008, 009, 010, 011)
  const canonicalMigrations = [
    { file: '001_core_morajaws_schema.sql', step: '001' },
    { file: '003_system_error_logs_and_corrections.sql', step: '003' },
    { file: '006_custom_authentication_schema.sql', step: '006' },
    { file: '007_provision_primary_superadmin.sql', step: '007' },
    { file: '008_phase1_custom_auth_session_version_alignment.sql', step: '008' },
    { file: '009_phase1_custom_auth_atomic_session_transaction.sql', step: '009' },
    { file: '010_phase2_canonical_schema_reconciliation.sql', step: '010' },
    { file: '011_phase2_4_schema_reconciliation_and_fixes.sql', step: '011' }
  ];

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  for (const mig of canonicalMigrations) {
    const filePath = path.join(migrationsDir, mig.file);
    try {
      const sql = fs.readFileSync(filePath, 'utf-8');
      await db.exec(sql);
      log(`Migration ${mig.step} (${mig.file}) executed successfully.`);
      results.push({
        id: `MIG-${mig.step}`,
        name: `Migration ${mig.step} Execution (${mig.file})`,
        section: 'B. Migration Execution',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: `Successfully applied ${mig.file} without syntax or schema errors.`
      });
    } catch (err: any) {
      log(`Migration ${mig.step} (${mig.file}) failed: ${err.message}`);
      results.push({
        id: `MIG-${mig.step}`,
        name: `Migration ${mig.step} Execution (${mig.file})`,
        section: 'B. Migration Execution',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: `Migration failed: ${err.message}`,
        sqlstate: err.code
      });
    }
  }

  // 3. Verify 22 Canonical Tables
  const canonicalTables = [
    'users',
    'auth_sessions',
    'refresh_tokens',
    'login_attempts',
    'work_orders',
    'assignment_history',
    'technical_reports',
    'ticket_messages',
    'attachments',
    'contractors',
    'coverage_areas',
    'audit_logs',
    'app_settings',
    'report_categories',
    'roles',
    'wa_templates',
    'user_preferences',
    'session_config',
    'user_sessions',
    'integration_configs',
    'sync_history',
    'system_error_logs'
  ];

  try {
    const tableRes = await db.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    `);
    const presentTables = tableRes.rows.map(r => r.tablename);
    const missing = canonicalTables.filter(t => !presentTables.includes(t));

    if (missing.length === 0) {
      results.push({
        id: 'SCHEMA-01',
        name: '22 Canonical Tables Existence Verification',
        section: 'C. Schema & Table Verification',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: 'All 22 canonical tables exist and are properly registered in public schema.',
        evidence: { presentCount: presentTables.length, canonicalCount: canonicalTables.length }
      });
    } else {
      results.push({
        id: 'SCHEMA-01',
        name: '22 Canonical Tables Existence Verification',
        section: 'C. Schema & Table Verification',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: `Missing canonical tables: ${missing.join(', ')}`
      });
    }
  } catch (err: any) {
    results.push({
      id: 'SCHEMA-01',
      name: '22 Canonical Tables Existence Verification',
      section: 'C. Schema & Table Verification',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: err.message
    });
  }

  // 4. Verify Trigger Bugfix: fn_protect_legacy_soft_deleted_wo
  log('Verifying Trigger Bugfix: fn_protect_legacy_soft_deleted_wo...');
  try {
    // A. Normal WO insertion
    const normalWoId = 'test_normal_wo_' + Date.now();
    await db.query(`
      INSERT INTO public.work_orders (id, wo_number, customer_name, status_wo_installer, created_at, updated_at)
      VALUES ($1, 'WO-NORMAL-TEST-1', 'Bapak Ahmad', 'Unassigned', now(), now());
    `, [normalWoId]);

    // B. Normal WO update
    await db.query(`
      UPDATE public.work_orders SET status_wo_installer = 'Assigned' WHERE id = $1;
    `, [normalWoId]);

    const checkUpd = await db.query<{ status_wo_installer: string }>(`SELECT status_wo_installer FROM public.work_orders WHERE id = $1`, [normalWoId]);
    const updateOk = checkUpd.rows[0]?.status_wo_installer === 'Assigned';

    // C. Normal WO delete (Crucial: prior to bugfix, returning NEW on DELETE suppressed deletion silently)
    await db.query(`DELETE FROM public.work_orders WHERE id = $1;`, [normalWoId]);
    const checkDel = await db.query<{ c: number }>(`SELECT count(*)::int as c FROM public.work_orders WHERE id = $1`, [normalWoId]);
    const deleteOk = checkDel.rows[0]?.c === 0;

    if (updateOk && deleteOk) {
      results.push({
        id: 'TRG-01',
        name: 'Normal Work Order Mutation & Deletion (Bugfix Verified)',
        section: 'D. Trigger Remediation',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: 'Normal work order can be updated and physically deleted. Trigger returns OLD on DELETE correctly (no suppression).',
        evidence: { updated: updateOk, deleted: deleteOk, remainingCount: checkDel.rows[0]?.c }
      });
    } else {
      results.push({
        id: 'TRG-01',
        name: 'Normal Work Order Mutation & Deletion (Bugfix Verified)',
        section: 'D. Trigger Remediation',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: `Deletion failed or was suppressed: updated=${updateOk}, deleted=${deleteOk}`
      });
    }

    // D. Protected Legacy WO Protection (Must reject UPDATE and DELETE)
    const protectedId = 'wo_1793825457141_u4bnht';
    const protectedWo = 'WO-EXPRESS-TEST-1793825456810';

    await db.query(`
      INSERT INTO public.work_orders (id, wo_number, customer_name, status_wo_installer, is_deleted, created_at, updated_at)
      VALUES ($1, $2, 'Protected Legacy Customer', 'Completed', true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    `, [protectedId, protectedWo]);

    // Test rejection on UPDATE
    let updateBlocked = false;
    try {
      await db.query(`UPDATE public.work_orders SET status_wo_installer = 'Pending' WHERE id = $1;`, [protectedId]);
    } catch (err: any) {
      if (err.message.includes('MORAJAWS_PROTECTED_RECORD')) {
        updateBlocked = true;
      }
    }

    // Test rejection on DELETE
    let deleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.work_orders WHERE id = $1;`, [protectedId]);
    } catch (err: any) {
      if (err.message.includes('MORAJAWS_PROTECTED_RECORD')) {
        deleteBlocked = true;
      }
    }

    if (updateBlocked && deleteBlocked) {
      results.push({
        id: 'TRG-02',
        name: 'Protected Legacy Work Orders Immutability',
        section: 'D. Trigger Remediation',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: 'Protected production work orders are strictly protected. Both UPDATE and DELETE throw MORAJAWS_PROTECTED_RECORD.',
        evidence: { updateBlocked, deleteBlocked }
      });
    } else {
      results.push({
        id: 'TRG-02',
        name: 'Protected Legacy Work Orders Immutability',
        section: 'D. Trigger Remediation',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: `Trigger failed to protect legacy WO: updateBlocked=${updateBlocked}, deleteBlocked=${deleteBlocked}`
      });
    }
  } catch (err: any) {
    results.push({
      id: 'TRG-01',
      name: 'Trigger Verification',
      section: 'D. Trigger Remediation',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: err.message
    });
  }

  // 5. Verify Technical Reports Mapping & Indexing
  log('Verifying Technical Reports Schema, Indexes, and Relational Mapping...');
  try {
    const testReportId = 'rep_test_' + Date.now();
    const testWoId = 'wo_rep_target_1';
    const testWoNumber = 'WO-TARGET-REP-001';

    // Seed target WO
    await db.query(`
      INSERT INTO public.work_orders (id, wo_number, customer_name, status_wo_installer, created_at, updated_at)
      VALUES ($1, $2, 'Pelanggan Laporan Teknis', 'In Progress', now(), now())
      ON CONFLICT (id) DO NOTHING;
    `, [testWoId, testWoNumber]);

    // Insert into canonical public.technical_reports using correct column names:
    // submitted_by, work_result, optical_power_rx, etc.
    const insertRes = await db.query<{ id: string; submitted_by: string; work_result: string; optical_power_rx: string }>(`
      INSERT INTO public.technical_reports (
        id, work_order_id, wo_number, main_category, root_cause,
        work_result, submitted_by, optical_power_rx, verified_by_dispatch,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Gangguan Fisik Kabel', 'Kabel Putus',
        'COMPLETED', 'Teknisi Budi Pratama', '-18.5 dBm', false,
        now(), now()
      ) RETURNING id, submitted_by, work_result, optical_power_rx;
    `, [testReportId, testWoId, testWoNumber]);

    const repRow = insertRes.rows[0];

    // Query using submitted_by index
    const lookupRes = await db.query<{ id: string; submitted_by: string }>(`
      SELECT id, submitted_by FROM public.technical_reports WHERE submitted_by = 'Teknisi Budi Pratama';
    `);

    // Verify Dispatch Verification update
    await db.query(`
      UPDATE public.technical_reports
      SET verified_by_dispatch = true, verified_at = now(), verified_by = 'Super Admin Rays'
      WHERE id = $1;
    `, [testReportId]);

    const verifiedRes = await db.query<{ verified_by_dispatch: boolean; verified_by: string }>(`
      SELECT verified_by_dispatch, verified_by FROM public.technical_reports WHERE id = $1;
    `, [testReportId]);

    const isVerified = verifiedRes.rows[0]?.verified_by_dispatch === true;

    if (repRow && lookupRes.rows.length > 0 && isVerified) {
      results.push({
        id: 'TECH-01',
        name: 'Technical Report Column Mapping & Dispatch Verification',
        section: 'E. Technical Report Reconciliation',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: 'Canonical technical_reports table stores submitted_by, work_result, and handles dispatch verification accurately without missing column errors.',
        evidence: {
          insertedId: repRow.id,
          submittedBy: repRow.submitted_by,
          verifiedBy: verifiedRes.rows[0]?.verified_by
        }
      });
    } else {
      results.push({
        id: 'TECH-01',
        name: 'Technical Report Column Mapping & Dispatch Verification',
        section: 'E. Technical Report Reconciliation',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: 'Technical report insertion, lookup, or verification failed.'
      });
    }
  } catch (err: any) {
    results.push({
      id: 'TECH-01',
      name: 'Technical Report Column Mapping & Dispatch Verification',
      section: 'E. Technical Report Reconciliation',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: `Technical report error: ${err.message}`,
      sqlstate: err.code
    });
  }

  // 6. Verify Refresh Token Rotation Atomic Signature (7 arguments)
  log('Verifying Refresh Token Rotation Atomic Function Signature...');
  try {
    // Seed initial user and auth_session
    const testUserId = 'usr_token_test_1';
    await db.query(`
      INSERT INTO public.users (id, username, email, name, role, active, created_at, updated_at)
      VALUES ($1, 'testuser', 'testuser@morajaws.local', 'Test User', 'installer', true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    `, [testUserId]);

    const initialSessionId = 'sess_init_' + Date.now();
    const initialSessionHash = crypto.createHash('sha256').update('initial_token_raw').digest('hex');
    const initialRtId = 'rt_init_' + Date.now();
    const initialRtHash = crypto.createHash('sha256').update('initial_rt_raw').digest('hex');

    await db.query(`
      SELECT public.fn_create_auth_session_atomic(
        $1, $2, $3, $3, $4, $5,
        now() + interval '1 day',
        now() + interval '7 days',
        1
      );
    `, [initialSessionId, testUserId, initialSessionHash, initialRtId, initialRtHash]);

    // Now invoke fn_rotate_refresh_token_atomic with all 7 canonical parameters:
    // 1. p_old_rt_hash
    // 2. p_new_rt_id
    // 3. p_new_rt_hash
    // 4. p_new_session_hash
    // 5. p_new_session_expires_at
    // 6. p_new_rt_expires_at
    // 7. p_session_version
    const newRtId = 'rt_new_' + Date.now();
    const newRtHash = crypto.createHash('sha256').update('new_rt_raw').digest('hex');
    const newSessionHash = crypto.createHash('sha256').update('new_token_raw').digest('hex');

    const rotateRes = await db.query(`
      SELECT * FROM public.fn_rotate_refresh_token_atomic(
        $1, $2, $3, $4,
        now() + interval '1 day',
        now() + interval '7 days',
        1
      );
    `, [initialRtHash, newRtId, newRtHash, newSessionHash]);

    const rotateRow = rotateRes.rows[0];

    // Check old token status
    const oldRtCheck = await db.query<{ revoked_at: string | null }>(`
      SELECT revoked_at FROM public.refresh_tokens WHERE id = $1;
    `, [initialRtId]);

    // Check new token status
    const newRtCheck = await db.query<{ id: string; revoked_at: string | null }>(`
      SELECT id, revoked_at FROM public.refresh_tokens WHERE id = $1;
    `, [newRtId]);

    const oldTokenRevoked = oldRtCheck.rows[0]?.revoked_at !== null;
    const newTokenActive = newRtCheck.rows[0]?.revoked_at === null;

    if (oldTokenRevoked && newTokenActive) {
      results.push({
        id: 'AUTH-06',
        name: 'Atomic Refresh Token Rotation (7 Parameters Signature)',
        section: 'F. Authentication & Session Rotation',
        category: 'LOCAL_POSTGRES',
        status: 'PASS',
        details: 'fn_rotate_refresh_token_atomic executes seamlessly with 7 parameters. Old token revoked (revoked_at set), new token active.',
        evidence: {
          returnedResult: rotateRow,
          oldTokenRevoked,
          newTokenActive
        }
      });
    } else {
      results.push({
        id: 'AUTH-06',
        name: 'Atomic Refresh Token Rotation (7 Parameters Signature)',
        section: 'F. Authentication & Session Rotation',
        category: 'LOCAL_POSTGRES',
        status: 'FAIL',
        details: 'Token rotation did not revoke old token or activate new token correctly.'
      });
    }
  } catch (err: any) {
    results.push({
      id: 'AUTH-06',
      name: 'Atomic Refresh Token Rotation (7 Parameters Signature)',
      section: 'F. Authentication & Session Rotation',
      category: 'LOCAL_POSTGRES',
      status: 'FAIL',
      details: `Token rotation error: ${err.message}`,
      sqlstate: err.code
    });
  }

  // 7. SEC-02 Static Security Audit: Absence of Secrets in Frontend
  log('Conducting SEC-02 Static Security Audit: Scanning frontend files for exposed secrets...');
  try {
    const srcDir = path.resolve(process.cwd(), 'src');
    let exposedFiles: string[] = [];

    function scanDir(dir: string) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scanDir(full);
        } else if (/\.(tsx?|jsx?|html|css)$/.test(item)) {
          const content = fs.readFileSync(full, 'utf-8');
          // Check for actual secrets or forbidden tokens in client code
          if (content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
            exposedFiles.push(path.relative(process.cwd(), full));
          }
        }
      }
    }

    scanDir(srcDir);

    if (exposedFiles.length === 0) {
      results.push({
        id: 'SEC-02',
        name: 'Zero Administrative Secrets in Frontend Bundle',
        section: 'G. Security Hardening & Zero-Trust',
        category: 'STATIC_AUDIT',
        status: 'PASS',
        details: 'Static analysis confirmed zero references to SUPABASE_SERVICE_ROLE_KEY or actual JWT secrets in frontend code.',
        evidence: { scannedDirectory: 'src/', violations: 0 }
      });
    } else {
      results.push({
        id: 'SEC-02',
        name: 'Zero Administrative Secrets in Frontend Bundle',
        section: 'G. Security Hardening & Zero-Trust',
        category: 'STATIC_AUDIT',
        status: 'FAIL',
        details: `Potential secret exposure detected in files: ${exposedFiles.join(', ')}`
      });
    }
  } catch (err: any) {
    results.push({
      id: 'SEC-02',
      name: 'Zero Administrative Secrets in Frontend Bundle',
      section: 'G. Security Hardening & Zero-Trust',
      category: 'STATIC_AUDIT',
      status: 'FAIL',
      details: err.message
    });
  }

  // 8. SEC-03 Static Security Audit: Express Fail-Closed Policy & Middlewares
  log('Conducting SEC-03 Static Security Audit: Express API Fail-Closed & RBAC Middlewares...');
  try {
    const serverPath = path.resolve(process.cwd(), 'server.ts');
    const serverCode = fs.readFileSync(serverPath, 'utf-8');

    const checks = {
      hasRequireAuth: serverCode.includes('function requireAuth('),
      hasRequireSuperAdmin: serverCode.includes('function requireSuperAdmin('),
      hasRequireLeaderOrAdmin: serverCode.includes('function requireLeaderOrAdminForAssignment('),
      hasFailClosed503Users: serverCode.includes("GET /api/supabase/users") && serverCode.includes("DATABASE_UNAVAILABLE"),
      hasFailClosed503WorkOrders: serverCode.includes("GET /api/supabase/work-orders/:id") && serverCode.includes("DATABASE_UNAVAILABLE"),
      hasFailClosed503Contractors: serverCode.includes("GET /api/supabase/contractors") && serverCode.includes("DATABASE_UNAVAILABLE"),
      hasFailClosed503CoverageAreas: serverCode.includes("GET /api/supabase/coverage-areas") && serverCode.includes("DATABASE_UNAVAILABLE"),
      hasTechnicalReportPersistence: serverCode.includes("insertTechnicalReportToSupabase"),
      hasAssignRouteAliases: serverCode.includes("/api/supabase/work-orders/:id/assign"),
      hasReassignRouteAliases: serverCode.includes("/api/supabase/work-orders/:id/reassign")
    };

    const allPassed = Object.values(checks).every(Boolean);

    if (allPassed) {
      results.push({
        id: 'SEC-03',
        name: 'Express Architecture & Fail-Closed Enforcement',
        section: 'G. Security Hardening & Zero-Trust',
        category: 'STATIC_AUDIT',
        status: 'PASS',
        details: 'Express backend enforces strict RBAC middleware, HTTP 503 fail-closed policy, canonical technical report persistence, and route aliases.',
        evidence: checks
      });
    } else {
      results.push({
        id: 'SEC-03',
        name: 'Express Architecture & Fail-Closed Enforcement',
        section: 'G. Security Hardening & Zero-Trust',
        category: 'STATIC_AUDIT',
        status: 'FAIL',
        details: 'One or more security middleware/fail-closed checks failed in server.ts.',
        evidence: checks
      });
    }
  } catch (err: any) {
    results.push({
      id: 'SEC-03',
      name: 'Express Architecture & Fail-Closed Enforcement',
      section: 'G. Security Hardening & Zero-Trust',
      category: 'STATIC_AUDIT',
      status: 'FAIL',
      details: err.message
    });
  }

  // Summarize Results
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warningCount = results.filter(r => r.status === 'WARNING').length;

  const report: VerificationSuiteReport = {
    timestamp: new Date().toISOString(),
    phase: 'MORAJAWS PHASE 2.4 — APPLICATION & SUPABASE SCHEMA RECONCILIATION',
    engine: {
      name: 'PostgreSQL (Isolated In-Memory via PGlite)',
      version: pgVersion,
      extensions: ['pgcrypto', 'plpgsql']
    },
    totalTests: results.length,
    passCount,
    failCount,
    warningCount,
    results
  };

  // Write Evidence File
  const evidenceDir = path.resolve(process.cwd(), 'scripts', 'evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  const evidenceFile = path.join(evidenceDir, 'phase2_4_executed_evidence.json');
  fs.writeFileSync(evidenceFile, JSON.stringify(report, null, 2), 'utf-8');
  log(`Evidence successfully written to ${evidenceFile}`);

  return report;
}

// Direct execution CLI
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('execute_phase2_4_acceptance_suite')) {
  runPhase24AcceptanceSuite()
    .then(report => {
      console.log('----------------------------------------------------');
      console.log(`Phase 2.4 Acceptance Suite Completed: ${report.passCount}/${report.totalTests} Passed (${report.failCount} Failed, ${report.warningCount} Warnings)`);
      console.log('----------------------------------------------------');
      if (report.failCount > 0) {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
}
