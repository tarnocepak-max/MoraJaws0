# MORAJAWS — MIGRATION RECONCILIATION MATRIX
## Comprehensive Evaluation Across Repository, Production, and Staging

**Document ID:** MORAJAWS-PHASE17A-MATRIX-001  
**Audit Date:** 2025-02-17  
**Production Target:** Supabase Project `wiahuupjgpadxqiiarzi`  
**Staging Target:** Supabase Project `lvytgqsvxntnvlohmrxi`  

---

### 1. Reconciliation Table

| Migration File | Primary Objective | Dependencies | Repo Status | Production (`wiahuupjgpadxqiiarzi`) | Staging (`lvytgqsvxntnvlohmrxi`) | Risk & Conflict Analysis |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `001_core_morajaws_schema.sql` | Initialize core tables (`work_orders`, `users`, `audit_logs`) | None | Present | UNVERIFIED (Assumed partial) | UNVERIFIED (Assumed partial) | **DUPLICATE**: Byte-for-byte identical to `002`. High risk of collision if run sequentially. |
| `002_schema_corrections.sql` | Schema corrections (identical to 001) | None | Present | UNVERIFIED | UNVERIFIED | **DUPLICATE**: Exact SHA-256 match with `001`. Must be consolidated/removed in Phase 17B. |
| `003_role_and_assignment_hardening.sql` | Enforce role check constraints and technician assignment logic | `001` | Present | UNVERIFIED | UNVERIFIED | Low risk. Adds check constraints on roles (`SUPERADMIN`, `DISPATCH`, `LEADER`, `INSTALLER`). |
| `004_fix_reports_and_logs.sql` | Technical reports and audit log column typing | `001`, `003` | Present | UNVERIFIED | UNVERIFIED | Low risk. Adjusts timestamp and jsonb attributes. |
| `005_fix_auth_users_foreign_keys.sql` | Links `users.id` to `auth.users(id)` | Supabase Auth | Present | UNVERIFIED | UNVERIFIED | **HIGH RISK**: Violates Custom Auth rule. Assumes Supabase Auth. Superseded by `015`. |
| `006_custom_authentication_schema.sql` | Creates custom `users`, `auth_sessions`, password hashes | pgcrypto | Present | UNVERIFIED | UNVERIFIED | **PREFIX COLLISION**: Collides with `006_phase16a...`. Core requirement for custom auth. |
| `006_phase16a_schema_alignment_and_droplists.sql` | Add `contractors`, `coverage_areas`, alignment droplists | `work_orders` | Present | UNVERIFIED | UNVERIFIED | **PREFIX COLLISION**: Collides with `006_custom...`. Attempts to reference `auth.users(id)`. |
| `007_phase16a2_1_preflight_schema_audit.sql` | Read-only schema audit script | None | Present | Non-DDL | Non-DDL | **PREFIX COLLISION**: Informational SQL only. Not a migration. |
| `007_phase16a2_rollback_plan.sql` | Rollback plan dropping tables | None | Present | DO NOT APPLY | DO NOT APPLY | **CRITICAL RISK**: Reversal script. Running automatically drops production tables! |
| `007_phase16a2_staging_account_alignment_reference.sql` | Reference SQL for staging accounts | Custom Auth | Present | Documentation | Documentation | **PREFIX COLLISION**: Informational query collection. |
| `007_phase16a2_staging_schema_initialization.sql` | Full schema initialization for staging | None | Present | Staging only | Staging only | **PREFIX COLLISION**: Duplicate DDL intended exclusively for staging bootstrapping. |
| `007_provision_primary_superadmin.sql` | Seeds initial superadmin user record | `users` | Present | UNVERIFIED | UNVERIFIED | **PREFIX COLLISION**: DML seed script. Hardcoded credentials. |
| `008_verify_production_schema.sql` | Production verification queries | None | Present | Non-DDL | Non-DDL | Informational assertion script; should not be in migration pipeline. |
| `009_auth_sessions_and_token_rotation.sql` | `fn_create_auth_session_atomic`, token rotation RPC | `auth_sessions` | Present | UNVERIFIED | UNVERIFIED | Essential custom auth RPC; matches backend `customAuthService.ts`. |
| `010_complete_custom_auth_cutover.sql` | Trigger preventing sync with `auth.users` | `009` | Present | UNVERIFIED | UNVERIFIED | Cleanly severs ties to Supabase Auth. High positive stability impact. |
| `011_fix_technical_reports_schema.sql` | Update report columns & technician assignments | `work_orders` | Present | UNVERIFIED | UNVERIFIED | Moderate risk. Resolves technician foreign key constraints. |
| `012_technical_reports_atomic_submission.sql` | `fn_submit_technical_report_atomic` v1 | `011` | Present | UNVERIFIED | UNVERIFIED | Deprecated by `014`. Signature replaced in subsequent migrations. |
| `013_fix_technical_reports_jsonb_handling.sql` | `fn_submit_technical_report_atomic` v2 | `012` | Present | UNVERIFIED | UNVERIFIED | Deprecated by `014`. Iteration on JSONB photo payloads. |
| `014_fix_technical_reports_photo_columns.sql` | `fn_submit_technical_report_atomic` v3 (final) | `013` | Present | UNVERIFIED | UNVERIFIED | Canonical report submission RPC matching `server/supabaseAdapter.ts`. |
| `015_phase2_5_internal_auth_rls_lockdown.sql` | Enforce RLS lockdown to `service_role` | All tables | Present | UNVERIFIED | UNVERIFIED | **SECURITY MILESTONE**: Disables anon/authenticated access, forces backend mediation. |
| `016_production_work_order_import_pipeline.sql` | Import staging, dedup constraints, atomic import RPC | `work_orders` | Present | UNVERIFIED | UNVERIFIED | **CORE IMPORT ENGINE**: Creates `uq_work_orders_wo_number_normalized` and import RPCs. |

---

### 2. Reconciliation Analysis & Incompatibilities

1. **The 006 Collision:**
   - Both `006_custom_authentication_schema.sql` and `006_phase16a_schema_alignment_and_droplists.sql` exist simultaneously.
   - If executed alphabetically, `006_custom_authentication_schema.sql` runs first, establishing the custom `users` table. Then `006_phase16a...` runs and attempts to reference `auth.users(id)`. This creates a schism between internal `users` and Supabase `auth.users`.
2. **The 007 Quinquennial Collision:**
   - Prefix 007 contains 5 distinct files with totally different roles (one rollback, one audit, one reference, one staging init, one seed).
   - If an automated migration tool (like Supabase CLI or Flyway) scans `/migrations/` by alphabetical order, `007_phase16a2_rollback_plan.sql` could execute and DROP tables that were just initialized.
3. **The Duplicate 001/002:**
   - `001_core_morajaws_schema.sql` and `002_schema_corrections.sql` are identical copies. Either `002` was mistakenly committed with `001`'s content or `001` was overwritten.

---

### 3. Verification Boundary Status
Because remote environment access tokens (`SUPABASE_SERVICE_ROLE_KEY`) are not stored in the workspace for security reasons, the live presence of each table and function in Production (`wiahuupjgpadxqiiarzi`) and Staging (`lvytgqsvxntnvlohmrxi`) cannot be verified via direct TCP connection during this turn.
All remote cells are formally classified as:
**`UNVERIFIED / BLOCKED — missing remote credentials`**
The verification queries provided in `PREFLIGHT_READONLY.sql` must be executed directly against both databases by authorized administrators.
