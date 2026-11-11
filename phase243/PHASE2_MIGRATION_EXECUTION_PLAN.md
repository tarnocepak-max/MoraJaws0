# MoraJaws Phase 2 — Database Migration Execution Plan
**Document ID:** `PHASE2_MIGRATION_EXECUTION_PLAN.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Target Platform:** Supabase PostgreSQL  
**Document Purpose:** Safe, step-by-step roadmap for executing schema reconciliation and data preparation without risking production stability  

---

## 1. Migration Safety Architecture

In accordance with Phase 2 guidelines, every new database migration in MoraJaws must strictly comply with the **Nine Pillars of Migration Safety**:

1. **Unique Canonical Numbering:** Every migration file carries an unambiguous numerical prefix (`010_...`).
2. **Explicit Purpose & Documentation:** Clear header comments detailing intent, affected tables, and dependencies.
3. **Precondition Validation:** Enforces prerequisites (e.g. baseline schema presence, custom auth active).
4. **Postcondition Verification:** Queryable assertions validating that columns, indexes, and triggers were created.
5. **Reversible / Rollback Specifications:** Non-destructive rollback scripts available for all added objects.
6. **Zero Accidental Data Loss:** Forbidden from using `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE`. Uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`.
7. **Zero Duplicate Schemas:** Schema reconciliation resolves overlaps without creating duplicate tables or redundant columns.
8. **Superadmin & Password Inviolability:** Account `rays` (`rayhanafirzanx@gmail.com`) and existing bcrypt credentials remain untouched.
9. **Pre-Execution Verification Gate:** Migrations are tested via local simulation and staging preflight before touching production.

---

## 2. Detailed 7-Step Migration Execution Plan

```text
[Step 1: Pre-Flight Verification]
   │  - Syntax validation, linting, and local test assertion
   ▼
[Step 2: Remote Backup & Snapshot]
   │  - Cloud-level database snapshot & pg_dump export
   ▼
[Step 3: Staging Deployment & Test]
   │  - Execute 010 on Staging (lvytgqsvxntnvlohmrxi)
   ▼
[Step 4: OWNER APPROVAL GATE] ◄── MANDATORY STOP POINT
   │  - Owner reviews staging test report and signs off
   ▼
[Step 5: Production Execution]
   │  - Execute 010 inside single atomic transaction (BEGIN...COMMIT)
   ▼
[Step 6: Post-Migration Integrity Check]
   │  - Verify 19 tables, indexes, triggers, and 3 protected WOs
   ▼
[Step 7: Production Health Verification]
   │  - Health endpoint check (/api/system/health, Express API connectivity)
```

---

### Step 1: Pre-Flight Verification (Static & Local Simulation)
- **Objective:** Verify migration syntax and application compatibility without database mutation.
- **Actions:**
  1. Validate SQL syntax of `010_phase2_canonical_schema_reconciliation.sql`.
  2. Run TypeScript compiler (`npm run build`) and linter (`npm run lint`).
  3. Execute automated test suites (`scripts/execute_phase1_custom_auth_integrity_tests.ts`).
- **Success Criteria:** Zero syntax errors, zero compiler errors, 100% test pass rate.

---

### Step 2: Database Snapshot & Backup Verification
- **Objective:** Establish an immutable recovery baseline.
- **Actions:**
  1. Trigger physical snapshot in Supabase dashboard.
  2. Take local custom-format dump using `pg_dump`:
     ```bash
     pg_dump "$DATABASE_URL" -Fc -b -v -f "morajaws_pre_phase3_backup.dump"
     ```
  3. Validate file existence and non-zero byte size.
- **Success Criteria:** Verified snapshot created; database administrator confirms restore capability.

---

### Step 3: Staging Execution & Verification
- **Objective:** Test execution on an identical remote PostgreSQL instance (Staging: `lvytgqsvxntnvlohmrxi`).
- **Actions:**
  1. Connect to Staging Supabase SQL Editor.
  2. Run `migrations/010_phase2_canonical_schema_reconciliation.sql`.
  3. Run `migrations/007_phase16a2_1_preflight_schema_audit.sql` to verify that all 19 tables, indexes, and triggers exist.
  4. Test login using test credentials to verify Custom Auth operates seamlessly.
- **Success Criteria:** Staging execution completes with `COMMIT`, all 19 tables verified, RLS enforced.

---

### Step 4: OWNER APPROVAL GATE (STOP AND WAIT)
- **Objective:** Prevent unapproved production mutations.
- **Policy:** The AI assistant or engineer **MUST STOP** and present the Staging test report to the application owner.
- **Requirement:** Production execution will NOT proceed without explicit written confirmation from the owner.

---

### Step 5: Production Execution (Atomic & Non-Destructive)
- **Objective:** Apply canonical schema reconciliation to Production Supabase.
- **Actions:**
  1. Connect to Production database via Supabase SQL Editor or trusted CI/CD runner.
  2. Execute `migrations/010_phase2_canonical_schema_reconciliation.sql` within an explicit transaction:
     ```sql
     BEGIN;
     -- Execution of Migration 010
     COMMIT;
     ```
  3. In the event of any SQL error, PostgreSQL automatically executes `ROLLBACK`, leaving the production database in its pristine pre-migration state.
- **Success Criteria:** Transaction commits with zero errors; no active queries disrupted.

---

### Step 6: Post-Migration Assertion & Data Integrity Verification
- **Objective:** Verify database structure and invariants immediately following execution.
- **Verification Queries:**
  1. **Table Count:** Verify 19 tables exist in `public` schema.
  2. **Work Orders Integrity:** Verify `installer_id`, `appointment_date`, `is_archived`, and `is_deleted` exist.
  3. **Protection Trigger:** Attempt a harmless dry-run update on protected WO `wo_1793825457141_u4bnht`; verify that PostgreSQL throws exception `MORAJAWS_PROTECTED_RECORD`.
  4. **Audit Trail Immutability:** Attempt `DELETE FROM public.audit_logs WHERE id = 'test'`; verify that exception `MORAJAWS_AUDIT_IMMUTABLE` is raised.
  5. **Super Admin Integrity:** Verify user `rays` has role `super_admin` and active status.
- **Success Criteria:** All 5 assertions pass.

---

### Step 7: Application Gateway & Health Verification
- **Objective:** Ensure Express backend interacts seamlessly with the reconciled schema.
- **Actions:**
  1. Send request to `/api/health`.
  2. Verify login endpoint `/api/auth/login`.
  3. Verify work order listing `/api/supabase/work-orders`.
  4. Verify system error logging `/api/supabase/settings/navigation_config`.
- **Success Criteria:** All endpoints return HTTP 200 with normal latency (< 150ms).

---

## 3. Rollback & Contingency Procedures

In the unlikely event of an operational anomaly:
1. **Transaction Automatic Abort:** If an error occurs during execution of Step 5, the entire migration aborts automatically.
2. **Selective Index Removal:** If composite indexes impact write latency unexpectedly, they can be dropped concurrently:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_work_orders_appointment_calendar;
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_work_orders_leader_scope;
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_work_orders_installer_scope;
   ```
3. **Trigger Deactivation:** If the protection trigger requires maintenance:
   ```sql
   DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
   ```
4. **Zero Structural Deletion:** Added columns remain intact without causing application degradation.
