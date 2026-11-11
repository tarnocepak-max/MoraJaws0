# MoraJaws Phase 2 — Environment & Staging vs. Production Audit
**Document ID:** `PHASE2_ENVIRONMENT_AUDIT.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Audit Scope:** Environment Isolation (`server/environmentConfig.ts`), Supabase Staging Project, Supabase Production Architecture, Environment Variables (`.env.example`), and Firebase Coexistence  

---

## 1. Executive Summary & Policy Compliance

The architectural destination of MoraJaws is to utilize **one single Supabase Production database** as its authoritative Single Source of Truth.

However, during Phase 2, strict preservation boundaries were enforced:
1. **Supabase Staging is NOT deleted or removed.**
2. **Production database URL is NOT altered.**
3. **Environment variables are NOT deleted.**
4. **Firebase Firestore and Firebase Storage are NOT deleted or disconnected.**
5. **Zero data migration or transfer between environments is performed.**
6. **Zero destructive DDL or DML changes are executed against any database.**
7. **Production and Staging are NOT assumed to have identical schemas.**

---

## 2. Supabase Staging Environment Audit

### 2.1. Staging Project Specifications
- **Project Reference ID:** `lvytgqsvxntnvlohmrxi`
- **Project Display Name:** `MoraJaws-Staging-Auth`
- **Default Supabase URL:** `https://lvytgqsvxntnvlohmrxi.supabase.co`
- **Cloud Region:** Singapore (`ap-southeast-1`)
- **Primary Historical Role:** Provisioned during Phase 15A/16A as an isolated staging environment to test Supabase Auth and schema alignment without risking live operations.

### 2.2. Comprehensive Inventory of Staging References

| Category | File Path | Nature of Staging Reference | Operational Status |
|:---|:---|:---|:---:|
| **Server Config** | `server/environmentConfig.ts` | Constants `STAGING_SUPABASE_PROJECT_ID`, `STAGING_DEFAULT_SUPABASE_URL`, `validateEnvironmentStartup()` | **ACTIVE CONFIG** (Isolator) |
| **Migrations** | `migrations/007_phase16a2_staging_schema_initialization.sql` | 19-table DDL blueprint targeting staging project `lvytgqsvxntnvlohmrxi` | **HISTORICAL BLUEPRINT** |
| **Migrations** | `migrations/007_phase16a2_1_preflight_schema_audit.sql` | Read-only SQL diagnostic query mentioning staging project `lvytgqsvxntnvlohmrxi` | **AUDIT TOOL** |
| **Migrations** | `migrations/007_phase16a2_staging_account_alignment_reference.sql` | Safeguarded account alignment procedure targeting staging auth user | **REFERENCE MANUAL** |
| **Migrations** | `migrations/007_phase16a2_rollback_plan.sql` | Rollback plan targeting staging project `lvytgqsvxntnvlohmrxi` | **DISASTER RECOVERY** |
| **Test Suites** | `scripts/execute_phase15a7_1_hardening_test.ts` | Automated mock tests asserting environment isolation rules | **ACTIVE TEST SUITE** |
| **Test Suites** | `scripts/execute_phase15a7_2_isolation_test.ts` | Verification that staging does not leak to production domain | **ACTIVE TEST SUITE** |
| **Test Suites** | `scripts/execute_phase15a7_3_staging_login_test.ts` | Staging login endpoint validation | **ACTIVE TEST SUITE** |
| **Test Suites** | `scripts/execute_phase15a7_5_completion_test.ts` | Assertions on `lvytgqsvxntnvlohmrxi` cookie separation | **ACTIVE TEST SUITE** |
| **Test Suites** | `scripts/execute_phase16a2_1_safety_and_alignment_test.ts` | Preflight safety verification on staging initialization scripts | **ACTIVE TEST SUITE** |

### 2.3. Active Configuration vs. Historical Artifacts
- **Active Isolator:** `server/environmentConfig.ts` actively guards the application against accidental cross-environment pollution. If `APP_ENV=production` is set, the server actively blocks any connection attempt containing `lvytgqsvxntnvlohmrxi`.
- **Historical DDLs:** The SQL files in `/migrations/` containing `007_phase16a2_` are historical staging setup scripts. They are NOT automatically executed on production and serve solely as technical records.

---

## 3. Supabase Production Environment Audit

### 3.1. Production Credentials Resolution
Production configuration is resolved server-side through the following environment variables:
- `PRODUCTION_SUPABASE_URL` / `SUPABASE_URL`: Production Supabase project origin (e.g., `https://<prod-id>.supabase.co`).
- `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`: Secret service-role key with administrative bypass privileges.
- `PRODUCTION_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`: Publishable key (strictly maintained on server-side only; direct browser calls revoked).

### 3.2. Fail-Closed Production Behavior
In `server/customAuthService.ts` and `server/supabaseClient.ts`:
1. If `NODE_ENV === 'production'`, the server enforces strict **fail-closed** mode.
2. If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing or disconnected, all login attempts and write mutations are halted immediately with error `DATABASE_UNAVAILABLE` (HTTP 503).
3. **No Local Fallback:** Under no circumstances will production fallback to in-memory sessions or JSON disk files (`isLocalAuthAllowed()` returns `false` unconditionally).

---

## 4. Firebase Coexistence & Transitory Status

### 4.1. Firebase Firestore Role
- **Status:** Transitory Archive & Backup.
- **Project ID:** `sonic-ripple-cxtlg`
- **Database ID:** `ai-studio-morajawsv6-c6c8e7c8-6b4d-4b80-8e21-1af2f4c29daa`
- **Current Runtime Status:** Active Firestore real-time listeners are deactivated in production (`isFirestoreActiveForEnvironment()` returns `false`), redirecting all traffic to the Express API.
- **Safety Directive:** Firebase configuration files (`firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`) are preserved untouched for rollback insurance.

### 4.2. Firebase Storage Role
- **Status:** Active Object / Photo Store.
- **Usage:** Technician before/after installation photos and chat attachment binaries remain hosted in Cloud Storage, with metadata tracked in PostgreSQL `public.attachments`.

---

## 5. Environment Isolation & Security Rules Summary

1. **Cookie Partitioning:**
   - Production cookie: `morajaws_session_prod`
   - Staging cookie: `morajaws_session_staging`
   - Development cookie: `morajaws_session_dev`
2. **Origin Validation:**
   - Production accepts redirects exclusively to `https://morajaws.ai.studio` or explicitly authorized production domains.
   - Staging rejects all requests directing to production domains.
3. **Zero Assumption:**
   - Production and Staging schemas are audited independently. Staging has a separate project reference and must not be used to infer Production schema state without direct inspection.
