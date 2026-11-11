# MORAJAWS PHASE 2.4 — TECHNICAL REPORT MAPPING REPORT
**Document Reference:** `PHASE2_4_TECHNICAL_REPORT_MAPPING.md`  
**Execution Timestamp:** 2026-11-11  
**Target Table:** `public.technical_reports`  
**Adapter Module:** `server/supabaseAdapter.ts`  
**API Endpoints:** `/api/tickets/:id/technical-report`, `/api/supabase/work-orders/:id/technical-report`, `/api/technical-reports/:id/verify`  

---

## 1. Executive Summary & Root Cause Analysis

In Phase 2.3 testing, test case `REL-03` failed with:
`SQLSTATE 42703: column "technician_name" of relation "technical_reports" does not exist`.

Upon detailed schema inspection across `migrations/001_core_morajaws_schema.sql` and `migrations/010_phase2_canonical_schema_reconciliation.sql`, it was determined that the column `technician_name` never existed in the canonical schema. The canonical database column designed to record the technician/installer who completed and submitted the report is **`submitted_by text`**.

Furthermore, prior to Phase 2.4, when a technician submitted a technical report via `app.post('/api/tickets/:id/technical-report')`, the payload was stored inside the `work_orders` table's JSONB `payload` column, but was not simultaneously inserted into the relational `public.technical_reports` table.

---

## 2. Canonical Schema Definition (`public.technical_reports`)

```sql
CREATE TABLE IF NOT EXISTS public.technical_reports (
  id text PRIMARY KEY,
  work_order_id text REFERENCES public.work_orders(id) ON DELETE CASCADE,
  ticket_id text,
  wo_number text NOT NULL,
  main_category text NOT NULL,
  root_cause text NOT NULL,
  sub_category text,
  root_cause_category text,
  root_cause_sub_category text,
  work_result text NOT NULL,
  technical_description text NOT NULL,
  corrective_action text NOT NULL,
  used_materials jsonb,
  device_serial_number text,
  optical_power_dbm text,
  optical_power_rx text,
  photo_before_url text,
  photo_after_url text,
  photos jsonb DEFAULT '[]'::jsonb,
  start_time timestamptz,
  end_time timestamptz,
  additional_notes text,
  verified_by_dispatch boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by text,
  submitted_by text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 3. Implementation of Data Access Layer in `server/supabaseAdapter.ts`

Three new authoritative adapter methods have been implemented:

### 3.1. `postgresRowToTechnicalReport(row: any): TechnicalReport`
Transforms snake_case PostgreSQL records to strongly-typed camelCase TypeScript models matching `src/types/index.ts`:
* Maps `row.submitted_by` -> `submittedBy: string`
* Maps `row.work_result` -> `workResult: string`
* Maps `row.work_order_id` -> `ticketId: string`
* Maps `row.optical_power_rx` -> `opticalPowerRx: string`
* Maps `row.verified_by_dispatch` -> `verifiedByDispatch: boolean`
* Maps `row.verified_by` -> `verifiedBy: string`

### 3.2. `insertTechnicalReportToSupabase(report: Partial<TechnicalReport>, woNumber?: string)`
Inserts or upserts a technical report into `public.technical_reports` with strict fallback defaults and data sanitation.

### 3.3. `verifyTechnicalReportInSupabase(reportId: string, dispatchUser: string)`
Enforces dispatch verification by updating `verified_by_dispatch = true`, `verified_at = now()`, and `verified_by = dispatchUser`.

---

## 4. API Endpoints Reconciliation in `server.ts`

1. **Simultaneous Relational Persistence:**
   `app.post('/api/tickets/:id/technical-report')` now calls both `updateWorkOrderInSupabase()` and `insertTechnicalReportToSupabase(technicalReport, ticket.woNumber)`.
2. **Dedicated Lookup Endpoint:**
   `GET ['/api/work-orders/:id/technical-report', '/api/supabase/work-orders/:id/technical-report', '/api/tickets/:id/technical-report']` retrieves the technical report from Supabase PostgreSQL by `work_order_id` or `wo_number`.
3. **Dedicated Verification Endpoint:**
   `PATCH ['/api/technical-reports/:id/verify', '/api/supabase/technical-reports/:id/verify']` allows Super Admin, Admin, and Dispatch to verify technical reports.

---

## 5. Indexes Added in Migration 011

To optimize technical report queries and dispatch dashboards, Migration 011 added the following indexes:
* `idx_technical_reports_submitted_by ON public.technical_reports (submitted_by)`
* `idx_technical_reports_verification ON public.technical_reports (verified_by_dispatch, verified_at)`
* `idx_technical_reports_work_order_id ON public.technical_reports (work_order_id)`
* `idx_technical_reports_wo_number ON public.technical_reports (wo_number)`

---

## 6. Test Evidence & Local Verification Verdict

* **Test Identifier:** `TECH-01`
* **Test Platform:** Isolated In-Memory PostgreSQL (PGlite v18.6 with `pgcrypto`)
* **Test Action:**
  1. Inserted target work order `WO-TARGET-REP-001`.
  2. Inserted technical report with `submitted_by = 'Teknisi Budi Pratama'`, `work_result = 'COMPLETED'`, and `optical_power_rx = '-18.5 dBm'`.
  3. Queried using index on `submitted_by` -> returned expected record.
  4. Executed dispatch verification update -> verified `verified_by_dispatch = true` and `verified_by = 'Super Admin Rays'`.
* **Test Status:** **PASS** (100% verified, 0 errors).
