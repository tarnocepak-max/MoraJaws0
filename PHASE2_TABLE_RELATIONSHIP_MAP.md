# MoraJaws Phase 2 — Table Relationship & Data Integrity Map
**Document ID:** `PHASE2_TABLE_RELATIONSHIP_MAP.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Database Engine:** PostgreSQL (Supabase)  
**Scope:** Entity-Relationship (ER) Architecture, Foreign Keys, Referential Constraints, Cascade Behaviors, and Business Invariants  

---

## 1. Entity-Relationship Overview

MoraJaws implements an enterprise-grade relational structure centered around the **Work Order** lifecycle, managed by **Staff Users** with strictly defined **Roles**, affiliated with partner **Contractors** operating across defined **Coverage Areas**.

```text
                  ┌──────────────┐
                  │    roles     │
                  └──────┬───────┘
                         │ 1:N
                         ▼
┌──────────────┐  1:N   ┌──────────────┐  1:N   ┌───────────────────┐
│ contractors  ├───────►│    users     ├───────►│   auth_sessions   │
└──────┬───────┘        └──────┬───────┘        └─────────┬─────────┘
       │                       │                          │ 1:N
       │ 1:N                   │ 1:N                      ▼
       │                       │                ┌───────────────────┐
       │                       │                │  refresh_tokens   │
       │                       │                └───────────────────┘
       │                       ▼
       │               ┌──────────────┐
       │               │login_attempts│
       │               └──────────────┘
       │
       │ 1:N (SET NULL)
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                           work_orders                            │
│  (Central Entity: wo_number UNIQUE normalized, Asia/Jakarta date)│
└──┬───────────────┬───────────────┬───────────────┬───────────────┘
   │ 1:N (RESTRICT)│ 1:N (RESTRICT)│ 1:N (RESTRICT)│ 1:N (RESTRICT)
   ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  assignment  │ │    ticket    │ │  technical   │ │ attachments  │
│   history    │ │   messages   │ │   reports    │ │  (storage)   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

---

## 2. Foreign Key & Cascade Behavior Matrix

| Source Table | Source Column | Target Table | Target Column | On Delete Action | On Update Action | Integrity Rationale |
|:---|:---|:---|:---|:---:|:---:|:---|
| `users` | `role` | `roles` | `code` | **RESTRICT** | **CASCADE** | Prevents orphaning staff profiles if a role code is updated. |
| `users` | `role_id` | `roles` | `id` | **SET NULL** | **CASCADE** | Secondary identifier for backward compatibility. |
| `users` | `contractor_id` | `contractors` | `id` | **SET NULL** | **CASCADE** | If a contractor company is archived or removed, staff profiles are preserved. |
| `auth_sessions` | `user_id` | `users` | `id` | **CASCADE** | **CASCADE** | Deleting a user account cleanly removes their active authentication sessions. |
| `refresh_tokens` | `user_id` | `users` | `id` | **CASCADE** | **CASCADE** | Refresh tokens are tied to user lifecycle. |
| `refresh_tokens` | `session_id` | `auth_sessions` | `id` | **CASCADE** | **CASCADE** | Revoking or dropping a parent session revokes the associated refresh token. |
| `work_orders` | `contractor_id` | `contractors` | `id` | **SET NULL** | **CASCADE** | Work orders are immutable telecom records; removing a contractor sets assignment to unassigned. |
| `assignment_history` | `work_order_id` | `work_orders` | `id` | **RESTRICT** | **CASCADE** | **Critical:** Assignment history must NEVER be cascaded. Work orders cannot be hard-deleted if history exists. |
| `assignment_history` | `contractor_id` | `contractors` | `id` | **SET NULL** | **CASCADE** | Historical assignments preserve contractor name string even if contractor ID is nullified. |
| `ticket_messages` | `ticket_id` | `work_orders` | `id` | **RESTRICT** | **CASCADE** | Live chat conversations are preserved for legal and operational audit compliance. |
| `technical_reports` | `work_order_id` | `work_orders` | `id` | **RESTRICT** | **CASCADE** | OPM optical power readings and installation results cannot be accidentally dropped. |
| `attachments` | `work_order_id` | `work_orders` | `id` | **RESTRICT** | **CASCADE** | Preserves photo and document metadata linked to tickets. |
| `user_preferences` | `user_id` | `users` | `id` | **RESTRICT** | **CASCADE** | Preferences are linked directly to user profile. |
| `report_categories` | `parent_id` | `report_categories`| `id` | **SET NULL** | **CASCADE** | Self-referencing hierarchical droplist parent linkage. |
| `system_error_logs` | `user_id` | `users` | `id` | **SET NULL** | **CASCADE** | Telemetry logs retain error information even if the error-triggering user is removed. |

---

## 3. Work Orders Data Integrity & Business Rules

### 3.1. Work Order Number Uniqueness vs. Normalization
- **Rule:** Every Work Order must have an absolute, unique identifier based on `wo_number`.
- **Database Implementation:**
  ```sql
  CREATE UNIQUE INDEX uq_work_orders_wo_number_normalized
  ON public.work_orders (lower(regexp_replace(btrim(wo_number), '\s+', '', 'g')))
  WHERE wo_number IS NOT NULL AND btrim(wo_number) <> '';
  ```
- **Rationale:** Prevents human data-entry duplicates where spaces or different casing are used (e.g. `WO 12345` vs `wo-12345` vs `WO12345`).

### 3.2. Customer ID vs. Work Order Number Distinction
- **Rule:** Customer ID (`id_customer` / `customer_id`) **MUST NEVER** be used as a uniqueness key for work orders.
- **Business Reality:** A customer is a physical subscriber who can have multiple service orders across their contract tenure (initial installation, ONT replacement, bandwidth upgrade, fiber repair, relocation).
- **Database Implementation:**
  - `customer_id` and `id_customer` are indexed via a standard non-unique lookup index:
    ```sql
    CREATE INDEX idx_work_orders_customer ON public.work_orders (customer_id, id_customer);
    ```
  - This allows rapid retrieval of customer ticket history without imposing an invalid uniqueness constraint.

### 3.3. Technician Assignment Architecture
- **Relationship Matrix:**
  - `work_orders.contractor_id` -> References `contractors.id`
  - `work_orders.leader_name` -> References the assigned Team Leader name
  - `work_orders.installer_name` & `work_orders.installer_id` -> References the assigned Field Technician
- **Reassignment History Retention:**
  - Whenever an installer or leader is reassigned, `server/supabaseAdapter.ts` writes an append-only row to `public.assignment_history` with:
    - `source_action: 'reassign'`
    - `previous_installer_name`
    - `installer_name` (new assignee)
    - `reason` & `performed_by`
  - Reassignment uses compensating transactions: if inserting into `assignment_history` fails, the update to `work_orders` is immediately rolled back to guarantee history can never be silently lost.

### 3.4. Technical Report Linkage
- **Integrity Guarantee:**
  - Each technical report is permanently bound to `work_orders(id)` via `work_order_id REFERENCES public.work_orders(id) ON DELETE RESTRICT`.
  - For rapid UI rendering in table view, an exact JSON snapshot is mirrored into `work_orders.technical_report`.
  - The normalized table `public.technical_reports` maintains individual columns for SQL filtering (`optical_power_dbm`, `device_serial_number`, `root_cause`).

### 3.5. Separation of Active vs. Archived Work Orders
- **Design Pattern:** Soft-archiving within `public.work_orders`.
- **Columns:** `is_archived` (`boolean NOT NULL DEFAULT false`), `archived_at` (`timestamptz`), `archived_by` (`text`).
- **Index:** `CREATE INDEX idx_work_orders_deleted_archived ON public.work_orders (is_deleted, is_archived);`
- **Application Query Rule:** All active operational views filter strictly by `is_archived = false AND is_deleted = false`. Archived work orders are only exposed when the operator explicitly selects the "Arsip" filter.
- **Three Protected Legacy Work Orders:**
  - `wo_1793825457141_u4bnht` (`WO-EXPRESS-TEST-1793825456810`)
  - `wo_imp_1793825458959_4i4f1h` (`WO-DUP-TEST-1793825458804`)
  - `wo_imp_1793825458959_262dei` (`WO-DUP-TEST-1793825458804-UNIQUE`)
  - Protected at the database engine level by trigger `trg_protect_legacy_wo_mutation` executing `fn_protect_legacy_soft_deleted_wo()`. Any `UPDATE` or `DELETE` attempt raises a fatal PostgreSQL exception.

---

## 4. Column Data Types & Timestamp Invariants

### 4.1. Date Types vs. Timestamptz Invariants
- **Appointment Date (`appointment_date`):**
  - **Type:** `DATE` (not `TIMESTAMPTZ`).
  - **Invariant:** Field operations operate in `Asia/Jakarta` (UTC+7). Using `timestamptz` for calendar dates risks shift anomalies (e.g. converting `2026-11-10 00:00:00 WIB` to `2026-11-09 17:00:00 UTC`), causing tickets to appear on the wrong day. Storing as plain `DATE` guarantees the schedule date remains constant regardless of server or client timezone.
- **Timestamps (`created_at`, `updated_at`, `event_at`, `login_at`):**
  - **Type:** `TIMESTAMPTZ` (Timezone-aware UTC timestamp).
  - **Invariant:** All system telemetry, session durations, and audit timestamps are stored in UTC with timezone awareness.

### 4.2. JSONB Columns Usage & Validation Constraints
- `roles.permissions`: `CHECK (jsonb_typeof(permissions) = 'array')`
- `contractors.coverage_areas`: `CHECK (jsonb_typeof(coverage_areas) = 'array')`
- `coverage_areas.clusters`: `CHECK (jsonb_typeof(clusters) = 'array')`
- `work_orders.work_sessions`: `CHECK (jsonb_typeof(work_sessions) = 'array')`
- `work_orders.unmapped_headers`: `CHECK (jsonb_typeof(unmapped_headers) = 'array')`
- `work_orders.additional_fields`: `CHECK (jsonb_typeof(additional_fields) = 'object')`
- `ticket_messages.attachments`: `CHECK (jsonb_typeof(attachments) = 'array')`
- `technical_reports.photos`: `CHECK (jsonb_typeof(photos) = 'array')`
- `app_settings.setting_value`: Indexed via GIN (`idx_app_settings_value_gin`) for dynamic key lookup.

---

## 5. Summary Checklist of Relational Health

- [x] All 19 core tables possess an explicit Primary Key.
- [x] Cascade deletion is prohibited on business audit ledgers (`assignment_history`, `ticket_messages`, `technical_reports`, `attachments`).
- [x] Soft-delete flags (`is_deleted`) are backed by composite indexes.
- [x] Normalized unique constraints prevent duplicate usernames, contractor codes, coverage areas, and work order numbers.
- [x] The 3 protected legacy work orders are shielded by a database-level PL/pgSQL guard trigger.
