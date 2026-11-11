# MoraJaws Phase 2 — Database Migration Reconciliation Report
**Document ID:** `PHASE2_MIGRATION_RECONCILIATION.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Audit Scope:** Entire `/migrations/` Directory, Historical Migration Files, Numbering Conflicts, and Proposed Canonical Sequence  

---

## 1. Executive Summary & Principles of Migration Reconciliation

In accordance with Phase 2 instructions, an exhaustive audit of the `/migrations/` directory was conducted. The migration scripts represent the developmental journey of MoraJaws across multiple iterative phases. 

### Mandatory Compliance Rules Followed:
1. **Zero Deletion:** Not a single historical migration file has been deleted from the repository.
2. **Zero Modification of Historical Files:** Past migration files that may have been run on any live database remain completely untouched.
3. **No Blind Re-Execution:** Historical migrations are never automatically re-run during server booting or testing without precondition checks.
4. **Registry Transparency:** Every file is assigned a definitive operational status (Applied Core, Active Auth, Draft Proposal, Read-Only Audit, Rollback Plan, or Reference).
5. **Canonical Non-Colliding Order:** A clear linear execution order is mapped to eliminate numbering ambiguities.
6. **New Reconciliation Migration (`010`):** All necessary schema corrections, missing physical columns, and database protection triggers are encapsulated in a new, idempotent, non-destructive migration file: `migrations/010_phase2_canonical_schema_reconciliation.sql`.

---

## 2. Inventory and Classification of Existing Migrations

| File Name in `/migrations/` | Size | Primary Purpose & Content | Status Classification | Execution Category |
|:---|:---:|:---|:---:|:---:|
| `001_core_morajaws_schema.sql` | 26.5 KB | Core 17 tables (`roles`, `users`, `work_orders`, `contractors`, `assignments`, etc.), initial RLS, triggers, indexes. | **APPLIED (BASELINE)** | Production & Staging Baseline |
| `002_schema_corrections.sql` | 26.5 KB | Exact 100% duplicate of `001_core_morajaws_schema.sql` (765 lines, identical checksum). | **DUPLICATE HISTORICAL** | Superseded by 001 (Do not re-run) |
| `003_system_error_logs_and_corrections.sql` | 3.8 KB | Creation of `public.system_error_logs`, realtime publication registration. | **APPLIED (BASELINE)** | Core Telemetry Schema |
| `004_security_hardening_and_schema_preparation.sql` | 6.8 KB | Specification for physical alignment of `system_error_logs` and defense-in-depth RLS. | **DRAFT / PREPARATION** | Blueprint Reference |
| `005_add_auth_user_id_to_users.sql` | 7.4 KB | Adding `auth_user_id UUID` to `public.users` for Supabase Auth mapping. | **DRAFT PROPOSAL** | Phase 15A Proposal (Historical) |
| `006_custom_authentication_schema.sql` | 6.6 KB | Physical creation of `auth_sessions`, `refresh_tokens`, `login_attempts`, and Custom Auth columns on `users`. | **ACTIVE CUSTOM AUTH** | **Authoritative Active Schema** |
| `006_phase16a_schema_alignment_and_droplists.sql` | 9.8 KB | Draft composite calendar indexes, `report_categories` table, and 3 WO protection trigger. | **DRAFT PROPOSAL** | Numbering Conflict with 006-Auth |
| `007_provision_primary_superadmin.sql` | 2.3 KB | Upsert primary superadmin account `rays` (`rayhanafirzanx@gmail.com`) with PBKDF2 hash. | **ACTIVE SEED** | Canonical Account Provisioning |
| `007_phase16a2_staging_schema_initialization.sql` | 49.3 KB | Staging-specific 19-table initialization script for staging project `lvytgqsvxntnvlohmrxi`. | **STAGING INITIALIZATION** | Staging Dedicated Blueprint |
| `007_phase16a2_1_preflight_schema_audit.sql` | 9.2 KB | 100% Read-Only SQL diagnostic script for schema verification. | **READ-ONLY AUDIT TOOL** | Diagnostic SQL Tool |
| `007_phase16a2_staging_account_alignment_reference.sql` | 11.1 KB | Read-first staging account alignment procedure for staging auth user. | **DOCUMENTATION / REF** | Safe Staging Procedure |
| `007_phase16a2_rollback_plan.sql` | 6.7 KB | Guarded rollback script for Phase 16A.2 staging changes. | **RECOVERY / ROLLBACK** | Disaster Recovery Reference |
| `008_phase1_custom_auth_session_version_alignment.sql` | 1.5 KB | Adding non-destructive `session_version` columns to `auth_sessions` and `refresh_tokens`. | **ACTIVE ALIGNMENT** | Phase 1 Session Hardening |
| `009_phase1_custom_auth_atomic_session_transaction.sql` | 9.3 KB | PL/pgSQL atomic functions (`fn_create_auth_session_atomic`, `fn_rotate_refresh_token_atomic`, etc.). | **ACTIVE PROPOSAL** | Phase 1 Atomic Functions |
| `010_phase2_canonical_schema_reconciliation.sql` *(NEW)* | 9.8 KB | Canonical reconciliation of missing columns, performance composite indexes, and 3 WO protection trigger. | **CANONICAL PROPOSAL** | Phase 2 Single Source of Truth |

---

## 3. Analysis & Resolution of Migration Conflicts

### 3.1. Conflict 1: Number 006 Collision
- **Conflicting Files:**
  1. `006_custom_authentication_schema.sql` (Creates Custom Auth tables: `auth_sessions`, `refresh_tokens`, `login_attempts`, `users` custom auth columns).
  2. `006_phase16a_schema_alignment_and_droplists.sql` (Proposes calendar indexes, `report_categories`, and WO protection trigger).
- **Root Cause:** Both files were authored during overlapping phases (Phase 15A Custom Auth development vs Phase 16A performance index drafting) using the prefix `006_`.
- **Resolution Strategy:**
  - `006_custom_authentication_schema.sql` is designated as the **Authoritative Migration 006**. The active Express backend and custom authentication engine depend directly on the tables defined in this file.
  - `006_phase16a_schema_alignment_and_droplists.sql` is classified as a **Historical Draft Proposal (006-Draft)**. Its valid non-destructive contents (calendar composite indexes, `report_categories`, and the 3 WO protection trigger) have been cleanly incorporated into the new canonical `010_phase2_canonical_schema_reconciliation.sql`.
  - Neither file is deleted or renamed, preserving Git commit history and audit trails.

### 3.2. Conflict 2: Number 007 Multiplicity (5 Files with Prefix `007_`)
- **Conflicting Files:**
  1. `007_provision_primary_superadmin.sql`
  2. `007_phase16a2_staging_schema_initialization.sql`
  3. `007_phase16a2_1_preflight_schema_audit.sql`
  4. `007_phase16a2_staging_account_alignment_reference.sql`
  5. `007_phase16a2_rollback_plan.sql`
- **Root Cause:** In Phase 16A.2, the engineer created multiple operational, audit, and recovery files prefixed with `007_phase16a2_` for staging operations, while `007_provision_primary_superadmin.sql` was created for production account provisioning.
- **Resolution Strategy:**
  - `007_provision_primary_superadmin.sql` is designated as the **Authoritative Migration 007** (Provisioning Account Seed).
  - The other 4 files are categorized in the registry according to their specific roles:
    - `007_phase16a2_staging_schema_initialization.sql`: Staging-only DDL archive.
    - `007_phase16a2_1_preflight_schema_audit.sql`: Read-only SQL diagnostic script (not a schema change).
    - `007_phase16a2_staging_account_alignment_reference.sql`: Reference manual for staging environment.
    - `007_phase16a2_rollback_plan.sql`: Rollback reference manual.
  - No file is deleted. The canonical sequence skips duplicate 007 numbers and proceeds to 008, 009, and 010.

### 3.3. Conflict 3: Duplicate Migration 002
- **Finding:** `002_schema_corrections.sql` is an exact duplicate of `001_core_morajaws_schema.sql`.
- **Resolution Strategy:** Marked as `DUPLICATE_SUPERSEDED`. Migration runners should skip `002_schema_corrections.sql` if 001 has been applied.

---

## 4. The Canonical Non-Colliding Migration Sequence

To ensure predictable, conflict-free migration execution when provisioning new databases or aligning staging/production, the canonical sequence is defined as follows:

```text
[001] 001_core_morajaws_schema.sql
        │  (Creates core 17 tables, roles, triggers, initial RLS)
        ▼
[003] 003_system_error_logs_and_corrections.sql
        │  (Creates system_error_logs table and error severity checks)
        ▼
[006] 006_custom_authentication_schema.sql
        │  (Creates auth_sessions, refresh_tokens, login_attempts, users auth fields)
        ▼
[007] 007_provision_primary_superadmin.sql
        │  (Provisions primary superadmin 'rays' / 'rayhanafirzanx@gmail.com')
        ▼
[008] 008_phase1_custom_auth_session_version_alignment.sql
        │  (Adds session_version to auth_sessions and refresh_tokens)
        ▼
[009] 009_phase1_custom_auth_atomic_session_transaction.sql
        │  (Adds PL/pgSQL atomic session functions & token rotation)
        ▼
[010] 010_phase2_canonical_schema_reconciliation.sql
           (Reconciles installer_id, composite indexes, 3 WO protection trigger, RLS)
```

### Skipped or Archival Entries (Preserved in Repository, Omitted from Sequential DDL Runner):
- `002_schema_corrections.sql` -> Duplicate of 001.
- `004_security_hardening_and_schema_preparation.sql` -> Reconciled into 010.
- `005_add_auth_user_id_to_users.sql` -> Historical Supabase Auth experiment (superseded by Custom Auth).
- `006_phase16a_schema_alignment_and_droplists.sql` -> Reconciled into 010.
- `007_phase16a2_staging_schema_initialization.sql` -> Staging-specific reference.
- `007_phase16a2_1_preflight_schema_audit.sql` -> Read-only diagnostic query.
- `007_phase16a2_staging_account_alignment_reference.sql` -> Staging diagnostic manual.
- `007_phase16a2_rollback_plan.sql` -> Rollback guide.

---

## 5. Traceability Matrix: Migration vs. Application Data Model

| Model / Table | Created In | Enhanced In | Reconciled In | Backend DAL Alignment |
|:---|:---:|:---:|:---:|:---|
| `public.roles` | 001 | - | 010 | Aligned (`server/supabaseClient.ts`, `server.ts`) |
| `public.users` | 001 | 006, 007, 008, 009 | 010 | Aligned (`userToPostgresRow`, `postgresRowToUser`) |
| `public.auth_sessions` | 006 | 008, 009 | 010 | Aligned (`server/customAuthService.ts`) |
| `public.refresh_tokens` | 006 | 008, 009 | 010 | Aligned (`server/customAuthService.ts`) |
| `public.login_attempts` | 006 | - | 010 | Aligned (`server/customAuthService.ts`) |
| `public.work_orders` | 001 | 006-Draft | 010 | Aligned (`workOrderToPostgresRow`, `postgresRowToWorkOrder`) |
| `public.assignment_history` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.contractors` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.coverage_areas` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.technical_reports` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.ticket_messages` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.attachments` | 001 | - | 010 | Aligned (`server/supabaseStorage.ts`, `server.ts`) |
| `public.wa_templates` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.app_settings` | 001 | 006-Draft | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.user_preferences` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`) |
| `public.session_config` | 001 | - | 010 | Aligned (`server.ts`, `server/supabaseAdapter.ts`) |
| `public.user_sessions` | 001 | - | 010 | Aligned (Archival session log) |
| `public.audit_logs` | 001 | 006 | 010 | Aligned (`server/supabaseAdapter.ts`, immutable trigger) |
| `public.system_error_logs` | 003 | 004 | 010 | Aligned (`logSystemErrorToSupabase`) |
| `public.integration_configs` | 001 | - | 010 | Aligned (`server.ts`) |
| `public.sync_history` | 001 | - | 010 | Aligned (`server/supabaseAdapter.ts`, Google Sheets sync) |
| `public.report_categories` | 006-Draft | - | 010 | Aligned (Optional droplist schema) |

---

## 6. Migration Registry Maintenance Procedure

To maintain schema traceability:
1. Every new schema modification must be assigned a unique three-digit incremental number (`011_...`, `012_...`).
2. Every migration must be strictly idempotent using `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS`.
3. Destructive DDL (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`) is forbidden without explicit owner approval and verified physical backup.
4. All migrations must be recorded in this registry before deployment.
