# MORAJAWS — PRODUCTION DATABASE SCHEMA AUDIT
## Public Schema Specification & Verification Status for Production (`wiahuupjgpadxqiiarzi`)

**Document ID:** MORAJAWS-PHASE17A-PROD-001  
**Target Database:** Supabase Production Project `wiahuupjgpadxqiiarzi`  
**Audit Date:** 2025-02-17  
**Live Access Status:** `BLOCKED — missing remote service role credentials in audit environment`  

---

### 1. Target Schema Specification (From Canonical Migrations 001–016)

Based on the canonical migration files and backend adapters (`server/supabaseAdapter.ts`, `server/woImportPipeline.ts`), the production database `wiahuupjgpadxqiiarzi` must contain the following objects:

#### A. Core Tables & Schemas

1. **`public.work_orders`**:
   - `id` (VARCHAR/TEXT, PK)
   - `wo_number` (VARCHAR(100), NOT NULL)
   - `ticket_number` (VARCHAR(100))
   - `customer_name` (VARCHAR(255))
   - `customer_phone` (VARCHAR(100))
   - `address` (TEXT)
   - `cluster` (VARCHAR(100))
   - `fat_code` (VARCHAR(100))
   - `fat_port` (VARCHAR(50))
   - `slot_port` (VARCHAR(50))
   - `package_type` (VARCHAR(100))
   - `status` (VARCHAR(50), DEFAULT 'PENDING')
   - `assigned_technician_id` (VARCHAR(100) / UUID)
   - `assigned_technician_name` (VARCHAR(255))
   - `assigned_leader_id` (VARCHAR(100) / UUID)
   - `contractor_id` (VARCHAR(100))
   - `coverage_area_id` (VARCHAR(100))
   - `appointment_date` (DATE / TIMESTAMPTZ)
   - `appointment_time_slot` (VARCHAR(50))
   - `import_batch_id` (VARCHAR(100))
   - `import_source` (VARCHAR(50))
   - `is_deleted` (BOOLEAN, DEFAULT FALSE)
   - `deleted_at` (TIMESTAMPTZ)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())
   - `updated_at` (TIMESTAMPTZ, DEFAULT NOW())
   - **Constraints & Indexes:**
     - PK: `work_orders_pkey (id)`
     - Unique Index: `uq_work_orders_wo_number_normalized` on `(LOWER(TRIM(wo_number)))` WHERE `is_deleted = FALSE`
     - Index: `idx_work_orders_status` on `(status)`
     - Index: `idx_work_orders_assigned_technician` on `(assigned_technician_id)`
     - Index: `idx_work_orders_created_at` on `(created_at)`

2. **`public.users`** (Internal Custom Auth):
   - `id` (UUID, PK, DEFAULT gen_random_uuid())
   - `username` (VARCHAR(100), UNIQUE, NOT NULL)
   - `email` (VARCHAR(255), UNIQUE)
   - `full_name` (VARCHAR(255), NOT NULL)
   - `password_hash` (TEXT, NOT NULL - bcrypt)
   - `role` (VARCHAR(50), NOT NULL, CHECK role IN ('SUPERADMIN', 'DISPATCH', 'LEADER', 'INSTALLER', 'MONITORING_DATA', 'IT_SUPPORT'))
   - `is_active` (BOOLEAN, DEFAULT TRUE)
   - `contractor_id` (VARCHAR(100))
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())
   - `updated_at` (TIMESTAMPTZ, DEFAULT NOW())

3. **`public.auth_sessions`**:
   - `id` (UUID, PK, DEFAULT gen_random_uuid())
   - `user_id` (UUID, FK -> `users(id)` ON DELETE CASCADE)
   - `refresh_token_hash` (TEXT, UNIQUE, NOT NULL)
   - `user_agent` (TEXT)
   - `ip_address` (VARCHAR(45))
   - `expires_at` (TIMESTAMPTZ, NOT NULL)
   - `revoked_at` (TIMESTAMPTZ)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

4. **`public.contractors`**:
   - `id` (VARCHAR(100), PK)
   - `name` (VARCHAR(255), NOT NULL)
   - `code` (VARCHAR(50), UNIQUE)
   - `is_active` (BOOLEAN, DEFAULT TRUE)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

5. **`public.coverage_areas`**:
   - `id` (VARCHAR(100), PK)
   - `name` (VARCHAR(255), NOT NULL)
   - `code` (VARCHAR(50), UNIQUE)
   - `contractor_id` (VARCHAR(100), FK -> `contractors(id)`)
   - `is_active` (BOOLEAN, DEFAULT TRUE)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

6. **`public.technical_reports`**:
   - `id` (VARCHAR(100), PK)
   - `wo_id` (VARCHAR(100), FK -> `work_orders(id)`)
   - `technician_id` (VARCHAR(100) / UUID)
   - `status` (VARCHAR(50), NOT NULL)
   - `modem_sn` (VARCHAR(100))
   - `stb_sn` (VARCHAR(100))
   - `optical_power` (NUMERIC)
   - `notes` (TEXT)
   - `photo_evidence` (JSONB)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

7. **`public.audit_logs`**:
   - `id` (UUID, PK, DEFAULT gen_random_uuid())
   - `user_id` (VARCHAR(100))
   - `action` (VARCHAR(100), NOT NULL)
   - `entity_type` (VARCHAR(50), NOT NULL)
   - `entity_id` (VARCHAR(100))
   - `old_values` (JSONB)
   - `new_values` (JSONB)
   - `ip_address` (VARCHAR(45))
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

---

### 2. Required Stored Procedures & Functions (RPC)

1. **`fn_create_auth_session_atomic`**:
   - Defined in: `009_auth_sessions_and_token_rotation.sql`
   - Purpose: Creates a new user session and invalidates previous sessions atomically if single-session is enforced.
2. **`fn_rotate_refresh_token_atomic`**:
   - Defined in: `009_auth_sessions_and_token_rotation.sql`
   - Purpose: Validates old token hash and issues new token hash with automatic reuse detection.
3. **`fn_submit_technical_report_atomic`**:
   - Defined in: `014_fix_technical_reports_photo_columns.sql`
   - Purpose: Inserts `technical_reports` and updates `work_orders.status` to 'COMPLETED' or 'PENDING_APPROVAL' within a single transaction.
4. **`fn_batch_import_work_orders`**:
   - Defined in: `016_production_work_order_import_pipeline.sql`
   - Purpose: Ingests array of JSON work orders, executes upsert / duplicate-check, and tracks import batch telemetry.
5. **`fn_protect_legacy_soft_deleted_wo`**:
   - Trigger Function: BEFORE UPDATE OR DELETE ON `public.work_orders`
   - Purpose: Blocks any modification or deletion of `wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, and `wo_imp_1793825458959_262dei`.

---

### 3. Remote Verification Status: `wiahuupjgpadxqiiarzi`

| Schema Component | Expected State | Live Remote Status | Verification Method |
| :--- | :--- | :---: | :--- |
| Table `work_orders` | Present with `uq_work_orders_wo_number_normalized` | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #1 |
| Table `users` | Present, internal auth schema with `password_hash` | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #2 |
| Table `auth_sessions` | Present with active session records | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #3 |
| Table `contractors` | Present with active contractors | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #4 |
| Table `coverage_areas`| Present with area mappings | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #5 |
| Table `technical_reports`| Present with JSONB photo evidence | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #6 |
| Trigger `fn_protect_legacy_soft_deleted_wo` | Attached BEFORE UPDATE/DELETE on `work_orders` | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #7 |
| RLS Policies | All tables locked to `service_role` (Anon/Auth DENIED) | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #8 |
| 3 Protected WOs | Exist in soft-deleted state (`is_deleted = true`) | **UNVERIFIED** | Requires execution of `PREFLIGHT_READONLY.sql` Query #9 |

**Conclusion:** Live production database state cannot be certified without running the read-only preflight suite directly against `wiahuupjgpadxqiiarzi`.
