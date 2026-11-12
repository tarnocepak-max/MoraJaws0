# MORAJAWS — PHASE 17B IMPLEMENTATION PLAN
## Migration Linearization, Ledger Standardization, and Deployment Roadmap

**Document ID:** MORAJAWS-PHASE17B-PLAN-001  
**Audit Reference:** Phase 17A Reconciliation Audit  
**Target Environments:** Staging (`lvytgqsvxntnvlohmrxi`) -> Production (`wiahuupjgpadxqiiarzi`)  
**Status:** DRAFT / PENDING USER APPROVAL  

---

### 1. Goals & Strategic Scope of Phase 17B

1. **Linearize & De-duplicate Migrations:**
   - Eliminate identical duplicate `002_schema_corrections.sql`.
   - Resolve the 006 prefix collision between custom auth and phase16a schema.
   - Restructure prefix 007 by moving rollback and audit scripts into an `/operational/` or `/audit/` folder, and sequencing staging init / seeds cleanly.
2. **Schema Ledger Standardization:**
   - Establish a standard `supabase_migrations` or `schema_migrations` tracking table so every deployed migration is explicitly recorded with its SHA-256 hash.
3. **Template Parity Remediation:**
   - Generate physical binary `.xlsx` spreadsheets for `BASE_DATA_WO.xlsx`, `INSTALLER_WO.xlsx`, and `ASSIGNED_TEKNISI.xlsx` in `/public/templates/`.
4. **Staging Execution First:**
   - Execute linearized migration pipeline against Staging (`lvytgqsvxntnvlohmrxi`).
   - Run automated end-to-end regression tests.
   - Verify protected work orders remain untouched.
5. **Production Deployment Window:**
   - Apply linearized migrations to Production (`wiahuupjgpadxqiiarzi`) only after 100% staging sign-off.

---

### 2. Proposed Linearized Migration Sequence

```text
Target Linearized Structure:
├── migrations/
│   ├── 001_core_morajaws_schema.sql                      (Base public tables)
│   ├── 002_role_and_assignment_hardening.sql             (Formerly 003)
│   ├── 003_fix_reports_and_logs.sql                      (Formerly 004)
│   ├── 004_custom_authentication_schema.sql              (Formerly 006_custom)
│   ├── 005_contractors_and_coverage_areas.sql            (Extracted from 006_phase16a)
│   ├── 006_auth_sessions_and_token_rotation.sql          (Formerly 009)
│   ├── 007_complete_custom_auth_cutover.sql              (Formerly 010)
│   ├── 008_fix_technical_reports_schema.sql              (Formerly 011)
│   ├── 009_technical_reports_photo_columns.sql           (Consolidated 012-014)
│   ├── 010_internal_auth_rls_lockdown.sql                (Formerly 015)
│   ├── 011_production_work_order_import_pipeline.sql     (Formerly 016)
│   └── 012_protect_legacy_work_orders.sql                (Explicit trigger registration)
└── migrations/archive/
    ├── 002_schema_corrections.sql                        (Duplicate of 001)
    ├── 005_fix_auth_users_foreign_keys.sql               (Superseded Supabase Auth attempt)
    ├── 007_phase16a2_1_preflight_schema_audit.sql        (Moved to audit directory)
    ├── 007_phase16a2_rollback_plan.sql                   (Moved to disaster recovery)
    ├── 007_phase16a2_staging_account_alignment.sql       (Moved to reference)
    ├── 007_phase16a2_staging_schema_initialization.sql   (Superseded by linear pipeline)
    ├── 007_provision_primary_superadmin.sql              (Extracted to seed runner)
    └── 008_verify_production_schema.sql                  (Moved to verification scripts)
```

---

### 3. Step-by-Step Execution Sequence

#### Step 1: Preflight Evidence Collection (Read-Only)
- Run `reports/PHASE17A_FINAL/PREFLIGHT_READONLY.sql` on Staging (`lvytgqsvxntnvlohmrxi`) and Production (`wiahuupjgpadxqiiarzi`).
- Store execution log in `reports/PHASE17B_PREFLIGHT_RESULTS.md`.

#### Step 2: Physical Spreadsheet Generation
- Generate binary files for `BASE_DATA_WO.xlsx`, `INSTALLER_WO.xlsx`, and `ASSIGNED_TEKNISI.xlsx` in `/public/templates/` using `xlsx` npm module.
- Verify file sizes, valid headers, and download links in UI.

#### Step 3: Migration Reorganization
- Reorganize `/migrations/` into the approved linearized sequence.
- Ensure all foreign keys point to `public.users(id)` and zero references point to `auth.users(id)`.

#### Step 4: Staging Validation Run
- Apply migrations sequentially to Staging (`lvytgqsvxntnvlohmrxi`).
- Execute `scripts/execute_phase16b_wo_import_test.mjs` against Staging endpoint.
- Verify 16/16 tests pass and 3 protected WOs are intact.

#### Step 5: Production Deployment & Cutover
- Execute scheduled maintenance window.
- Apply linearized migrations to Production (`wiahuupjgpadxqiiarzi`).
- Run read-only verification queries to confirm zero regressions.
- Deliver final sign-off report.
