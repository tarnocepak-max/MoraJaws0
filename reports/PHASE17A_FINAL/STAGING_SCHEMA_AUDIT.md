# MORAJAWS — STAGING DATABASE SCHEMA AUDIT
## Public Schema Specification & Verification Status for Staging (`lvytgqsvxntnvlohmrxi`)

**Document ID:** MORAJAWS-PHASE17A-STAGE-001  
**Target Database:** Supabase Staging Project `lvytgqsvxntnvlohmrxi`  
**Supabase URL:** `https://lvytgqsvxntnvlohmrxi.supabase.co`  
**Audit Date:** 2025-02-17  
**Live Access Status:** `BLOCKED — missing remote service role credentials in audit environment`  

---

### 1. Staging Environment Role & Objectives

Staging project `lvytgqsvxntnvlohmrxi` is designated as the pre-production sandbox for MoraJaws. Its public schema must be an exact structural clone of Production `wiahuupjgpadxqiiarzi` to ensure:
1. Work Order batch imports execute with identical constraint enforcement (`uq_work_orders_wo_number_normalized`).
2. Custom authentication session generation and token rotation operate identically.
3. RLS policies and table grants do not expose data to anonymous callers.
4. The 3 protected work orders are replicated for regression testing and prevented from modification.

---

### 2. Staging-Specific Migrations in Repository

The repository contains two staging-focused migration files:
1. **`007_phase16a2_staging_schema_initialization.sql`**:
   - Intended to initialize `work_orders`, `contractors`, `coverage_areas`, and custom authentication on staging.
   - **Issues Identified**:
     - Shares the `007` prefix with 4 other migration files.
     - Contains hardcoded staging seeds that may conflict with production seeds.
     - References `auth.users(id)` in early lines before custom auth was finalized.
2. **`007_phase16a2_staging_account_alignment_reference.sql`**:
   - Reference documentation for alignment of test accounts across roles:
     - `superadmin_staging`
     - `dispatch_staging`
     - `leader_staging`
     - `installer_staging`

---

### 3. Remote Verification Matrix: `lvytgqsvxntnvlohmrxi`

| Schema Component | Expected Staging State | Remote Status | Action Required |
| :--- | :--- | :---: | :--- |
| Table `work_orders` | Must match production DDL + normalized index | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #1 on staging |
| Table `users` | Must contain custom auth columns (no Supabase Auth sync) | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #2 on staging |
| Table `auth_sessions` | Must exist with active token hash column | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #3 on staging |
| Table `contractors` | Active contractors populated | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #4 on staging |
| Table `coverage_areas`| Active areas mapped to contractors | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #5 on staging |
| Table `technical_reports`| Present with JSONB schema matching `014` | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #6 on staging |
| Trigger Protection | `fn_protect_legacy_soft_deleted_wo` attached | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #7 on staging |
| RLS Policies | Locked to `service_role` | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #8 on staging |
| 3 Protected WOs | Replicated and verified soft-deleted | **UNVERIFIED** | Run `PREFLIGHT_READONLY.sql` Query #9 on staging |

---

### 4. Discrepancy Risk Analysis (Staging vs. Production)

1. **Drift Due to Migration 007 Collisions:**
   Because `007_phase16a2_staging_schema_initialization.sql` was authored specifically for staging, there is significant risk that staging was initialized with a different SQL sequence than production.
2. **Missing Migration Ledger Table (`schema_migrations`):**
   Neither production nor staging has an enforced or verified `supabase_migrations` table referenced in the repository. Without a formal ledger, migrations may have been applied manually through the Supabase SQL Editor.
3. **Action for Phase 17B:**
   Before applying any new changes, run `PREFLIGHT_READONLY.sql` on both instances and compare the resulting schema dumps line by line to detect any column drift.
