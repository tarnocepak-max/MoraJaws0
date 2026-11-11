# MORAJAWS — WORK ORDER IMPORT PIPELINE (PRODUCTION READY)

## 1. Single Source of Truth Architecture

MoraJaws implements an authoritative, fail-closed, single-source-of-truth architecture where **Supabase PostgreSQL** is the sole persistence layer for all Work Order entities:

```
[Browser / Excel Upload]
       │
       ▼ (multipart / JSON body)
[Frontend Validation & Pre-Import Preview]
       │
       ▼ (POST /api/supabase/work-orders/import)
[Express Backend API + requireImportPermission RBAC]
       │
       ▼ (Idempotency Check & Transaction Safety)
[Supabase DAL (server/supabaseAdapter.ts)]
       │
       ▼ (Service Role Auth, RLS Enforced)
[Supabase PostgreSQL (public.work_orders & public.work_order_imports)]
       │
       ▼ (Authoritative Confirmation: inserted, updated, skipped, errors)
[Frontend Re-fetch: GET /api/supabase/work-orders]
```

### Persistence Guarantees
- **No Mocking / No Local Persistence Fallback**: Neither `localStorage`, `sessionStorage`, `IndexedDB`, nor in-memory arrays serve as a database for Work Orders.
- **Fail-Closed Policy**: If Supabase credentials are missing or the database is unavailable, the import pipeline halts visibly with HTTP 503 (`DATABASE_UNAVAILABLE` or `SUPABASE_NOT_CONFIGURED`). No fake success responses or local fallback mutations are permitted in production.
- **Internal Authentication Unbroken**: MoraJaws retains its enterprise internal authentication scheme (Superadmin, Dispatch, Leader, Installer, Monitoring Data, IT Support). PostgREST roles (`anon`, `authenticated`) are revoked in Migration 015; all queries use the secure backend `service_role`.

---

## 2. Excel Parsing & Multi-Sheet Architecture

### Supported Official Templates
1. `BASE_DATA_WO.xlsx` (46-column canonical master baseline)
2. `data_wo_20261018.xlsx` (45-column operational template with unnamed notes columns)
3. `WO_KORLAP.xlsx` / `template_wo_korlap.xlsx`
4. `INSTALLER_WO.xlsx` / `ASSIGNED_TEKNISI.xlsx`

### Smart Sheet & Header Detection
- **Workbook Scanner** (`src/utils/excelClient.ts`): Automatically inspects all sheets in the workbook. Scores sheets by relevance based on presence of essential keywords (`wo_number`, `customer_name`, `street_name`, etc.). Sheets like summary sheets or note sheets are deprioritized.
- **Dynamic Header Row Discovery (Rows 0-15)**: Scans rows 0 through 15 to locate the true header row, tolerating metadata banners, merged header rows, blank rows, and notes.
- **Multi-Sheet UI Selector**: When a workbook contains more than one sheet, the user can toggle between sheets via an interactive dropdown in `TextToTableImporter.tsx`.

---

## 3. Column Mapping & Mandatory Fields

The canonical engine (`src/services/woFieldMappingEngine.ts`) supports 46 canonical fields. To protect business operations, the following 9 mandatory columns are enforced:

1. **Customer ID** (`idCustomer` / `customerId`): Must be exactly 7 digits (`^[0-9]{7}$`).
2. **WO Number** (`woNumber` / `workOrderNumber`): Non-empty, alphanumeric pattern.
3. **Street Name** (`streetName`): Non-empty customer address.
4. **Cluster Name** (`clusterName`): Cluster or complex identifier.
5. **FAT Code** (`fatCode` / `fat`): Fiber Access Terminal identifier.
6. **FDT Code** (`fdtCode` / `fdt`): Fiber Distribution Terminal identifier.
7. **Customer Phone** (`customerPhone`): Normalized telephone number (supports `08...`, `628...`, `+628...`).
8. **Contractor Name** (`contractorName` / `contactorName`): Partner organization name.
9. **Area** (`area`): Operational coverage territory.

If any mandatory column is missing from the file header, the import pipeline halts immediately (`headerCheckPassed = false`). Unmapped or unnamed columns are preserved verbatim in `additionalFields`.

---

## 4. Duplicate Detection & Non-Destructive Update Policies

### Level 1: In-File Duplicate Detection
- Normalized key comparison (trimmed, uppercase, normalized punctuation).
- Within a single upload batch, duplicated WO numbers are identified immediately. The first occurrence is preserved, while duplicates are counted and rejected.

### Level 2: Database Conflict Detection
- **Unique Constraint**: Enforced at PostgreSQL level by normalized unique index `uq_work_orders_wo_number_normalized` (`LOWER(TRIM(wo_number))`).
- **Policy `skip` (Default)**: Existing database records are skipped and reported as `duplicatesIgnored`.
- **Policy `update_allowed`**: Safely updates editable customer and scheduling fields:
  - `appointment_date`
  - `slot_time`
  - `remarks_agent`
  - `ticket_category`
  - `customer_phone`
  - `updated_at`, `updated_by`
- **Critical Preservation Rule**: `update_allowed` **NEVER** overwrites `installer_name`, technician assignment history, or submitted `technical_report` records.

---

## 5. Security & RBAC Enforcement

- **Authorized Roles**: `super_admin`, `dispatch`, `management_data`.
- **Blocked Roles**: `leader`, `installer`, anonymous requests (returns HTTP 403 / 401).
- **Backend Middleware**: Enforced via `requireImportPermission` in `server.ts`.
- **Double Submit Protection**: Idempotency keys (`idempotency_key` unique constraint in `public.work_order_imports`) prevent duplicate concurrent submission. Frontend action buttons are locked during in-flight network requests.

---

## 6. Audit & History

Every import execution is tracked in:
- `public.work_order_imports`: Stores `import_id`, `filename`, `sheet_name`, `uploaded_by`, `total_rows`, `inserted_rows`, `updated_rows`, `duplicate_rows`, `failed_rows`, and `status`.
- `public.audit_logs`: Detailed operational audit trail logging operator, batch ID, and metrics.
