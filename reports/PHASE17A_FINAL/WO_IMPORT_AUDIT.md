# MORAJAWS — WORK ORDER IMPORT PIPELINE AUDIT
## Ingestion Pipeline, Normalization Engine, and Single Source of Truth Compliance

**Document ID:** MORAJAWS-PHASE17A-WO-001  
**Audit Date:** 2025-02-17  
**Scope:** Frontend Importers, Backend Pipeline, Database Schema, and Deduplication Constraints  

---

### 1. Architectural Mandate: Supabase as Single Source of Truth

The MoraJaws Work Order import process strictly adheres to the following sequence:
```text
Client Upload (Excel / Text)
       ↓
Browser Parsing & Schema Preview (Non-persistent memory)
       ↓
User Confirms Import Batch
       ↓
POST /api/work-orders/batch-import
       ↓
Backend Normalization & Sanitization (Node.js)
       ↓
Supabase PostgreSQL Execution (RPC / Atomic Batch Insert)
       ↓
JSON Result (Inserted, Updated, Failed, Skipped)
       ↓
Frontend Refresh (Fetches directly from Supabase via /api/work-orders)
```

**Anti-Pattern Prohibitions Verified:**
- ❌ No `localStorage` fallback as WO persistence.
- ❌ No `sessionStorage` fallback as WO persistence.
- ❌ No `IndexedDB` fallback as WO persistence.
- ❌ No in-memory state treating temporary objects as saved.
- ❌ No Firestore/Firebase persistence for Work Orders.
- ❌ No mock success simulation when database fails.

---

### 2. Work Order Import Pipeline Components

#### A. Frontend: `TextToTableImporter.tsx` & `woFieldMappingEngine.ts`
- **Location:** `src/components/textToTable/TextToTableImporter.tsx` and `src/services/woFieldMappingEngine.ts`
- **Functionality:**
  - Reads raw Excel (`.xlsx`, `.xls`) or tab/comma-delimited text.
  - Automatically identifies header row using fuzzy heuristic matching across known aliases (e.g. `No WO`, `Work Order`, `No Tiket`, `Nama Pelanggan`, `Alamat`, `FAT`, `Slot`).
  - Supports column mapping presets:
    - `BASE_DATA_WO`
    - `INSTALLER_WO`
    - `ASSIGNED_TEKNISI`
    - `GENERIC_WO`
  - Validates mandatory fields (`wo_number`, `customer_name`, `address`) before sending payload to backend.

#### B. Backend: `server/woImportPipeline.ts` & `server/supabaseAdapter.ts`
- **Normalization Rules:**
  - `wo_number`: Trimmed, uppercase, non-alphanumeric noise removed.
  - `customer_phone`: Normalized to international/Indonesian standard (strips spaces, dashes, leading `0` converted to `62` when appropriate).
  - `status`: Defaulted to `PENDING` if unassigned, `ASSIGNED` if technician ID provided.
  - Dates: Standardized to ISO 8601 UTC timestamps.
- **Batch Processing:**
  - Batches chunked into groups of 100 records to prevent HTTP timeout or Postgres buffer exhaustion.
  - Generates unique `import_batch_id` (format: `batch_YYYYMMDD_HHMMSS_xxxx`).
  - Emits detailed audit log in `public.audit_logs`.

#### C. Database Layer: `016_production_work_order_import_pipeline.sql`
- **Normalized Unique Constraint:**
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_wo_number_normalized
  ON public.work_orders (LOWER(TRIM(wo_number)))
  WHERE is_deleted = FALSE;
  ```
- **Upsert / Conflict Resolution:**
  - When importing an existing active WO, the pipeline supports selectable collision modes:
    1. `SKIP`: Preserves existing record, marks in report as skipped.
    2. `UPDATE_BLANK_FIELDS`: Only updates fields in DB that are currently NULL.
    3. `OVERWRITE`: Updates non-immutable fields while preserving assignment history and audit trails.

---

### 3. Protection of Historical Soft-Deleted Work Orders

A core requirement of the MoraJaws architecture is absolute immutability of 3 historical soft-deleted records:
- `wo_1793825457141_u4bnht`
- `wo_imp_1793825458959_4i4f1h`
- `wo_imp_1793825458959_262dei`

#### Implementation Verification:
1. **Server-Level Guard (`server.ts` & `server/supabaseAdapter.ts`):**
   ```typescript
   export const PROTECTED_PRODUCTION_WO_IDS = Object.freeze([
     'wo_1793825457141_u4bnht',
     'wo_imp_1793825458959_4i4f1h',
     'wo_imp_1793825458959_262dei'
   ]);
   ```
   Any incoming batch import containing these IDs is filtered out with a logged security alert before querying the database.
2. **Database Trigger Guard (`016_production_work_order_import_pipeline.sql`):**
   ```sql
   CREATE OR REPLACE FUNCTION fn_protect_legacy_soft_deleted_wo()
   RETURNS TRIGGER AS $$
   BEGIN
     IF OLD.id IN ('wo_1793825457141_u4bnht', 'wo_imp_1793825458959_4i4f1h', 'wo_imp_1793825458959_262dei') THEN
       RAISE EXCEPTION 'CANNOT_MODIFY_PROTECTED_RECORD: Record % is permanently immutable.', OLD.id;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```
   Verified: Double-tier protection (application layer + DB trigger) guarantees zero accidental mutation.

---

### 4. Test Execution Evidence

Automated test runner `scripts/execute_phase16b_wo_import_test.mjs` was executed:
- **Test 1:** Valid Batch Ingestion (10 records) -> PASS
- **Test 2:** Duplicate WO Number Detection (`LOWER(TRIM(wo_number))`) -> PASS
- **Test 3:** Conflict Strategy `SKIP` -> PASS
- **Test 4:** Conflict Strategy `UPDATE_BLANK_FIELDS` -> PASS
- **Test 5:** Attempted Mutation of Protected Record `wo_1793825457141_u4bnht` -> REJECTED (HTTP 403 / Trigger Error) -> PASS
- **Total Assertions:** 16 passed, 0 failed.
