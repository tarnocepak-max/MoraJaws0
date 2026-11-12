# MORAJAWS — SCHEMA ADAPTER COMPATIBILITY AUDIT
## Code vs Database Object Contract Verification

**Document ID:** MORAJAWS-PHASE17A-COMPAT-001  
**Audit Date:** 2025-02-17  
**Scope:** Backend Adapters (`server/supabaseAdapter.ts`, `server/customAuthService.ts`, `server/woImportPipeline.ts`) vs SQL Migrations 001–016  

---

### 1. Adapter to Migration Object Mapping

We performed a line-by-line contract audit between the TypeScript backend methods and the PostgreSQL database objects defined in `/migrations/`.

| TypeScript Backend Method | Target DB Object | Expected Signature / Type | Matching Migration | Contract Status |
| :--- | :--- | :--- | :---: | :---: |
| `supabaseAdapter.getWorkOrders()` | `TABLE public.work_orders` | Returns work order records filtered by `is_deleted = false` | `016` | 🟢 COMPATIBLE |
| `supabaseAdapter.getWorkOrderById(id)` | `TABLE public.work_orders` | Select by `id` | `016` | 🟢 COMPATIBLE |
| `supabaseAdapter.batchInsertWorkOrders(items)` | `RPC fn_batch_import_work_orders` / Table insert | Array of JSON work orders with normalized `wo_number` | `016` | 🟢 COMPATIBLE |
| `supabaseAdapter.submitTechnicalReport(report)` | `RPC fn_submit_technical_report_atomic` | `(p_wo_id, p_tech_id, p_status, p_modem_sn, p_stb_sn, p_optical_power, p_notes, p_photos)` | `014` | 🟢 COMPATIBLE |
| `customAuthService.findUserByUsername(username)` | `TABLE public.users` | Columns: `id, username, password_hash, role, is_active, full_name` | `006_custom...` | 🟢 COMPATIBLE |
| `customAuthService.createSession(userId, tokenHash)` | `RPC fn_create_auth_session_atomic` | `(p_user_id, p_refresh_token_hash, p_expires_at, p_user_agent, p_ip)` | `009` | 🟢 COMPATIBLE |
| `customAuthService.rotateToken(oldHash, newHash)` | `RPC fn_rotate_refresh_token_atomic` | `(p_old_token_hash, p_new_token_hash, p_new_expires_at)` | `009` | 🟢 COMPATIBLE |
| `supabaseAdapter.getContractors()` | `TABLE public.contractors` | Columns: `id, name, code, is_active` | `006_phase16a...` | 🟢 COMPATIBLE |
| `supabaseAdapter.getCoverageAreas()` | `TABLE public.coverage_areas` | Columns: `id, name, code, contractor_id, is_active` | `006_phase16a...` | 🟢 COMPATIBLE |

---

### 2. Discovered RPC Evolution & Signature Drift

The stored procedure `fn_submit_technical_report_atomic` underwent three iterations across migrations:
1. `012_technical_reports_atomic_submission.sql`:
   - First version. Accepted individual photo columns (`p_photo_before`, `p_photo_after`, `p_photo_modem`).
2. `013_fix_technical_reports_jsonb_handling.sql`:
   - Refactored photo inputs to accept a unified JSONB array.
3. `014_fix_technical_reports_photo_columns.sql`:
   - Final production version. Supports both structured JSONB evidence and backward-compatible optical power telemetry.
- **Backend Sync:** `server/supabaseAdapter.ts` invokes the signature defined in `014`.
- **Preflight Requirement:** Database must have migration `014` applied to avoid parameter mismatch errors when submitting reports.

---

### 3. Work Order Column Naming & Data Type Alignment

| Frontend Model (`src/types/workOrder.ts`) | Backend Property (`server/woImportPipeline.ts`) | Database Column (`public.work_orders`) | Type Match |
| :--- | :--- | :--- | :---: |
| `id` | `id` | `id` (VARCHAR/TEXT) | ✅ PASS |
| `woNumber` | `wo_number` | `wo_number` (VARCHAR(100)) | ✅ PASS |
| `ticketNumber` | `ticket_number` | `ticket_number` (VARCHAR(100)) | ✅ PASS |
| `customerName` | `customer_name` | `customer_name` (VARCHAR(255)) | ✅ PASS |
| `customerPhone` | `customer_phone` | `customer_phone` (VARCHAR(100)) | ✅ PASS |
| `address` | `address` | `address` (TEXT) | ✅ PASS |
| `cluster` | `cluster` | `cluster` (VARCHAR(100)) | ✅ PASS |
| `fatCode` | `fat_code` | `fat_code` (VARCHAR(100)) | ✅ PASS |
| `fatPort` | `fat_port` | `fat_port` (VARCHAR(50)) | ✅ PASS |
| `slotPort` | `slot_port` | `slot_port` (VARCHAR(50)) | ✅ PASS |
| `packageType` | `package_type` | `package_type` (VARCHAR(100)) | ✅ PASS |
| `status` | `status` | `status` (VARCHAR(50)) | ✅ PASS |
| `assignedTechnicianId` | `assigned_technician_id` | `assigned_technician_id` (VARCHAR/UUID) | ✅ PASS |
| `assignedLeaderId` | `assigned_leader_id` | `assigned_leader_id` (VARCHAR/UUID) | ✅ PASS |
| `contractorId` | `contractor_id` | `contractor_id` (VARCHAR(100)) | ✅ PASS |
| `coverageAreaId` | `coverage_area_id` | `coverage_area_id` (VARCHAR(100)) | ✅ PASS |
| `isDeleted` | `is_deleted` | `is_deleted` (BOOLEAN) | ✅ PASS |

**Verdict:** The backend adapters and TypeScript data transfer objects are 100% aligned with the target PostgreSQL schema defined in the latest migrations.
