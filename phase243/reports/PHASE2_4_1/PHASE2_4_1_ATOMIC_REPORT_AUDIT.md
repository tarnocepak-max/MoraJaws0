# MORAJAWS PHASE 2.4.1 — ATOMIC REPORT AUDIT
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Target Function:** `public.fn_submit_technical_report_atomic(...)`  
**Endpoint:** `POST /api/tickets/:id/report` (alias: `/api/work-orders/:id/report`)  
**Status:** **AUDITED & VERIFIED PASS**

---

## 1. Migration 012 & 013 Function Audit

### Security & Privilege Configuration
- **Security Context:** `SECURITY DEFINER`
  - *Rationale:* Allows technician report submissions to atomically update `work_orders`, `technical_reports`, and `audit_logs` under transactional authority while enforcing strict application-level identity checks inside the function body.
- **Search Path:** `SET search_path = public, pg_temp;`
  - *Rationale:* Eliminates schema-hijacking vulnerabilities (`search_path` injection).
- **Execution Grants:**
  - `REVOKE ALL ON FUNCTION public.fn_submit_technical_report_atomic(...) FROM PUBLIC, anon, authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.fn_submit_technical_report_atomic(...) TO service_role;`
  - *Rationale:* External untrusted clients cannot invoke the function directly via PostgREST without routing through the backend Express API.

### Transactional Atomicity & Row Locking
- The function locks the target Work Order using `SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id OR wo_number = p_work_order_id FOR UPDATE;`.
- Row-level locking prevents race conditions between concurrent report submissions, checkout operations, and dispatcher assignments.
- If any stage fails (e.g. invalid report field, nonexistent WO, unauthorized technician), a PostgreSQL `RAISE EXCEPTION` is triggered, aborting the transaction and rolling back any staged changes.

---

## 2. Validation & Assignment Scoping Logic

### A. Input Data Validation
- Mandatory check for `workResult` (`trim(COALESCE(p_report_data->>'workResult', '')) != ''`).
- Mandatory check for `technicalDescription` (`trim(COALESCE(p_report_data->>'technicalDescription', '')) != ''`).
- Mandatory check for `correctiveAction` (`trim(COALESCE(p_report_data->>'correctiveAction', '')) != ''`).
- If any required field is missing, function raises exception with error code `22023` (`INVALID_REPORT_DATA`).

### B. Role & Technician Assignment Gate
- Roles permitted to submit reports: `installer`, `super_admin`, `superadmin`, `admin`, `dispatch`, `leader`, `management_data`.
- When `p_user_role` is `'installer'`:
  - Compares `v_wo.installer_name` with `p_submitted_by`.
  - If technician name does not match assigned technician, function raises exception with error code `42501` (`FORBIDDEN_SCOPE`).
  - Mapped to HTTP 403 Forbidden in Express.

---

## 3. Idempotency & Concurrency Safety

- The function checks if an existing technical report already exists for the Work Order.
- If an existing report is found, or if `p_report_data->>'id'` is provided:
  - Reuses the existing report ID.
  - Updates the existing record in `public.technical_reports` via `ON CONFLICT (id) DO UPDATE`.
  - Prevents primary key collisions and duplicate records caused by client offline sync replays or rapid double-submissions.

---

## 4. HTTP Status Mapping Matrix

The Express route maps database exceptions to standard HTTP response codes:

| Scenario / Error Code | HTTP Status | Code / Error Message | Result |
| :--- | :--- | :--- | :--- |
| **Successful Submission** | `200 OK` | `success: true`, returns report and updated WO | **PASS** |
| **Missing Mandatory Field** (`22023`) | `400 Bad Request` | `INVALID_REPORT_DATA` | **PASS** |
| **Technician Not Assigned** (`42501`) | `403 Forbidden` | `FORBIDDEN_SCOPE` | **PASS** |
| **Work Order Not Found** (`P0002`) | `404 Not Found` | `WORK_ORDER_NOT_FOUND` | **PASS** |
| **Duplicate Constraint Conflict** (`23505`) | `409 Conflict` | `CONFLICT` | **PASS** |
| **PostgreSQL / Supabase Down** | `503 Service Unavailable` | `DATABASE_UNAVAILABLE` | **PASS** |
