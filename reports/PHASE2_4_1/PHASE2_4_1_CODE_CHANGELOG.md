# MORAJAWS PHASE 2.4.1 — CODE CHANGELOG
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Date:** 2026-11-11  

---

## 1. Migrations

### Added: `/migrations/013_phase2_4_1_atomic_report_and_security_hardening.sql`
- **Purpose:** Non-destructive atomic persistence & security hardening for technician reporting.
- **Key Enhancements:**
  - Adds schema alignment columns `check_out_at`, `work_duration_minutes`, and `work_duration_formatted` to `public.work_orders` (`IF NOT EXISTS`).
  - Implements enhanced PostgreSQL function `public.fn_submit_technical_report_atomic(...)`.
  - Enforces `SECURITY DEFINER` with strict `SET search_path = public, pg_temp`.
  - Implements row-level locking on `public.work_orders` (`FOR UPDATE`) to prevent race conditions during concurrent checkouts or report submissions.
  - Implements role validation (`installer`, `super_admin`, `admin`, `dispatch`, `leader`, `management_data`).
  - Implements assignment scoping for `installer` role: verifies technician matches `wo.installer_name`.
  - Reuses existing report ID for idempotency on network retries and offline sync replays.
  - Computes work duration from `check_in_at` to checkout timestamp.
  - Upserts `public.technical_reports` and synchronizes `public.work_orders` status and session state.
  - Inserts immutable record into `public.audit_logs`.
  - Restricts `EXECUTE` strictly to `service_role`; revokes from `PUBLIC`, `anon`, and `authenticated`.

### Corrected: `/migrations/012_phase2_4_1_atomic_technical_report.sql`
- **Fix:** Provided missing format arguments to `RAISE EXCEPTION` in lines 113 and 128 (`p_work_order_id` and `p_submitted_by, v_wo.wo_number`) to resolve PostgreSQL parameter count error when executed in strict database engines.

---

## 2. Server & Backend Adapters

### Modified: `/server/supabaseAdapter.ts`
- Added `isForbidden` and `isInvalidInput` boolean flags to `SupabaseOpError`.
- Updated `classifySupabaseError` to map PostgreSQL error code `42501` and messages containing `FORBIDDEN_SCOPE` or `tidak ditugaskan` to `isForbidden: true`.
- Updated `classifySupabaseError` to map error code `22023` and messages containing `INVALID_REPORT_DATA` or `wajib diisi` to `isInvalidInput: true`.
- Mapped error code `P0002` and `WORK_ORDER_NOT_FOUND` to `isNotFound: true`.
- Enhanced `submitTechnicalReportAtomic(...)` to parse and return composite output:
  - `data.report`: Typed `TechnicalReport` record.
  - `data.workOrder`: Updated `Ticket` record.
  - `data.rawResult`: Full JSONB response from RPC call.

### Modified: `/server.ts`
- **Endpoint `POST /api/tickets/:id/report` (and alias `/api/work-orders/:id/report`):**
  - Replaced disjoint two-step persistence (`updateWorkOrderInSupabase()` + `insertTechnicalReportToSupabase()`) with single call to `submitTechnicalReportAtomic()`.
  - Added strict payload validation (`cleanId`, `report`, mandatory fields).
  - Enforced RBAC check: only authorized staff roles can submit reports.
  - Enforced fail-closed policy: returns HTTP 503 `DATABASE_UNAVAILABLE` when database is down.
  - Mapped specific error codes: HTTP 200 (Success), 400 (Invalid Data), 403 (Forbidden Scope / Unassigned Installer), 404 (Work Order Not Found), 409 (Conflict), 503 (Database Unavailable).
- **Endpoint `GET /api/supabase/work-orders/:id`:**
  - Enforced fail-closed: returns HTTP 503 `DATABASE_UNAVAILABLE` when `!isSupabaseMode()`, preventing false HTTP 404 responses.
- **Endpoint `GET /api/supabase/users`:**
  - Enforced fail-closed: returns HTTP 503 `DATABASE_UNAVAILABLE` when database is inaccessible without falling back to `db.users`.
- **Middleware `resolveUserFromHeader`:**
  - Added handling for `DATABASE_UNAVAILABLE` from `verifyAccessToken()` to return HTTP 503 instead of falling through when in production mode.

---

## 3. Frontend & Offline Handling

### Modified: `/src/context/AppContext.tsx`
- **`saveTechnicalReport` function:**
  - Removed client-side dual-write `saveTicketToFirestore` call.
  - Awaits backend response from `POST /api/tickets/:id/report`.
  - Sets `setSyncStatus('SAVED')` only upon receiving HTTP 200 and PostgreSQL confirmation.
  - When offline, enqueues item via `enqueueChange()` and sets `setSyncStatus('PENDING_SYNC')`.
  - Does not mark state as saved if backend returns an error.
- **Offline Queue Replay Handler (`registerAppSyncHandler`):**
  - Updated `REPORT` action handler to replay queued reports via real HTTP POST to `/api/tickets/:id/report`.
  - Confirms state commit to `SAVED` upon successful HTTP 200 response or retains item in queue with error notification.

### Modified: `/src/components/tickets/TechnicalReportForm.tsx`
- Added distinct `warning` style notice for `PENDING_SYNC` status ("Tersimpan di Antrean Offline (PENDING_SYNC)"), keeping it visually differentiated from `SAVED` (green success banner) and `ERROR` (red error banner).

---

## 4. Test Suite & Scripts

### Added: `/scripts/execute_phase2_4_1_acceptance_suite.ts`
- 56 exhaustive test scenarios covering migrations 001-013, 22 canonical tables, atomic report persistence, rollback, idempotency, role scoping, real Express HTTP API endpoints, fail-closed policy, 15 custom auth scenarios, and frontend bundle security scan.

### Modified: `/package.json`
- Added scripts:
  - `"test:phase2.4": "tsx scripts/execute_phase2_4_acceptance_suite.ts"`
  - `"test:phase2.4.1": "tsx scripts/execute_phase2_4_1_acceptance_suite.ts"`
