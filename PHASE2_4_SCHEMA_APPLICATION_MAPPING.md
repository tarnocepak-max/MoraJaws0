# MORAJAWS PHASE 2.4 — SCHEMA & APPLICATION MAPPING REPORT
**Document Reference:** `PHASE2_4_SCHEMA_APPLICATION_MAPPING.md`  
**Execution Timestamp:** 2026-11-11  
**Target Architecture:** Supabase PostgreSQL authoritative Single Source of Truth (SSOT)  
**Safety Protocol:** Zero Remote Database Mutations | Zero Production Accounts Altered | Isolated Disposable Verification  

---

## 1. Executive Summary

This report establishes the complete reconciliation between the 22 canonical Supabase PostgreSQL tables and the MoraJaws TypeScript interfaces, backend adapters (`server/supabaseAdapter.ts`, `server/supabaseAuthAdapter.ts`, `server/customAuthService.ts`), API payload contracts, and frontend state structures.

Prior to Phase 2.4, minor field naming ambiguities existed across test suites and legacy code (e.g., `full_name` vs canonical `name`, `status` vs canonical `status_wo_installer`, and `technician_name` vs canonical `submitted_by`). Phase 2.4 formally establishes the authoritative canonical mapping, ensuring full bidirectional parity and type-safe integration across the entire application stack.

---

## 2. Inventory of the 22 Canonical PostgreSQL Tables

| # | Table Name | Primary Key | Key Columns / Relational Foreign Keys | TypeScript Model Parity |
|---|------------|-------------|---------------------------------------|-------------------------|
| 1 | `public.users` | `id (text)` | `username`, `name`, `email`, `role`, `active`, `session_version`, `must_change_password`, `contractor_id` -> `contractors(id)` | Fully Aligned (`ServerUser`, `User`) |
| 2 | `public.auth_sessions` | `id (text)` | `user_id` -> `users(id)`, `session_id_hash`, `token_hash`, `session_version`, `expires_at`, `revoked_at` | Fully Aligned (`AuthSession`) |
| 3 | `public.refresh_tokens` | `id (text)` | `user_id` -> `users(id)`, `session_id` -> `auth_sessions(id)`, `token_hash`, `session_version`, `expires_at`, `revoked_at` | Fully Aligned (`RefreshTokenRow`) |
| 4 | `public.login_attempts` | `id (text)` | `username_attempted`, `ip_address`, `attempt_time`, `success`, `failure_reason` | Fully Aligned (`LoginAttempt`) |
| 5 | `public.work_orders` | `id (text)` | `wo_number`, `customer_name`, `status_wo_installer`, `status_wo_agent`, `installer_name`, `contractor_id`, `is_deleted` | Fully Aligned (`Ticket`, `WorkOrderRow`) |
| 6 | `public.assignment_history` | `id (text)` | `ticket_id`, `wo_number`, `action`, `performed_by`, `assigned_to`, `slot_time`, `created_at` | Fully Aligned (`AssignmentHistoryItem`) |
| 7 | `public.technical_reports` | `id (text)` | `work_order_id` -> `work_orders(id)`, `wo_number`, `submitted_by`, `work_result`, `optical_power_rx`, `verified_by_dispatch` | Fully Aligned (`TechnicalReport`) |
| 8 | `public.ticket_messages` | `id (text)` | `ticket_id`, `wo_number`, `sender_name`, `sender_role`, `message_text`, `attachments (jsonb)` | Fully Aligned (`TicketMessage`) |
| 9 | `public.attachments` | `id (text)` | `work_order_id`, `file_name`, `file_url`, `file_type`, `file_size`, `uploaded_by` | Fully Aligned (`AttachmentRow`) |
| 10 | `public.contractors` | `id (text)` | `name`, `code`, `active`, `clusters (jsonb)`, `contact_person`, `phone` | Fully Aligned (`Contractor`) |
| 11 | `public.coverage_areas` | `id (text)` | `name`, `clusters (jsonb)`, `active`, `payload (jsonb)` | Fully Aligned (`CoverageArea`) |
| 12 | `public.audit_logs` | `id (text)` | `action`, `category`, `target_id`, `details`, `performed_by`, `created_at` (Append-Only) | Fully Aligned (`AuditLogEntry`) |
| 13 | `public.app_settings` | `key (text)` | `value (jsonb)`, `description`, `updated_at` | Fully Aligned (`AppSettings`) |
| 14 | `public.report_categories` | `id (text)` | `name`, `code`, `subcategories (jsonb)`, `active` | Fully Aligned (`ReportCategory`) |
| 15 | `public.roles` | `id (text)` | `code (unique)`, `name`, `permissions (jsonb)`, `is_system` | Fully Aligned (`RoleDefinition`) |
| 16 | `public.wa_templates` | `id (text)` | `name`, `template_key`, `body`, `variables (jsonb)`, `active` | Fully Aligned (`WATemplate`) |
| 17 | `public.user_preferences` | `id (text)` | `user_id` -> `users(id)`, `preferences (jsonb)`, `updated_at` | Fully Aligned (`UserPreferences`) |
| 18 | `public.session_config` | `id (text)` | `jwt_expiry_minutes`, `refresh_expiry_days`, `max_concurrent_sessions` | Fully Aligned (`SessionConfig`) |
| 19 | `public.user_sessions` | `id (text)` | Legacy session tracking table retained for backward audit trails | Fully Aligned (`LegacyUserSession`) |
| 20 | `public.integration_configs` | `id (text)` | `provider`, `config (jsonb)`, `active`, `updated_at` | Fully Aligned (`IntegrationConfig`) |
| 21 | `public.sync_history` | `id (text)` | `sync_type`, `records_processed`, `status`, `error_details (jsonb)` | Fully Aligned (`SyncHistoryRow`) |
| 22 | `public.system_error_logs` | `id (text)` | `error_code`, `message`, `stack_trace`, `endpoint`, `user_id`, `created_at` | Fully Aligned (`SystemErrorLog`) |

---

## 3. Detailed Column-to-Property Mappings for Critical Entities

### 3.1. `users` Table Mapping
* PostgreSQL: `id text PRIMARY KEY` <-> TypeScript: `id: string`
* PostgreSQL: `username text NOT NULL UNIQUE` <-> TypeScript: `username: string`
* PostgreSQL: `name text NOT NULL` <-> TypeScript: `name: string` (and frontend alias `fullName?: string`)
* PostgreSQL: `email text` <-> TypeScript: `email: string`
* PostgreSQL: `role text NOT NULL REFERENCES public.roles(code)` <-> TypeScript: `role: 'superadmin' | 'admin' | 'dispatch' | 'leader' | 'installer' | 'viewer'`
* PostgreSQL: `active boolean NOT NULL DEFAULT true` <-> TypeScript: `active: boolean`
* PostgreSQL: `must_change_password boolean NOT NULL DEFAULT false` <-> TypeScript: `mustChangePassword?: boolean`
* PostgreSQL: `session_version integer NOT NULL DEFAULT 1` <-> TypeScript: `sessionVersion: number`
* PostgreSQL: `is_deleted boolean NOT NULL DEFAULT false` <-> TypeScript: `isDeleted?: boolean`

### 3.2. `work_orders` Table Mapping
* PostgreSQL: `id text PRIMARY KEY` <-> TypeScript: `id: string`
* PostgreSQL: `wo_number text NOT NULL` <-> TypeScript: `woNumber: string`
* PostgreSQL: `customer_name text` <-> TypeScript: `customerName: string`
* PostgreSQL: `status_wo_installer text NOT NULL DEFAULT 'Unassigned'` <-> TypeScript: `statusWOInstaller: string`
* PostgreSQL: `status_wo_agent text NOT NULL DEFAULT 'Pending'` <-> TypeScript: `statusWOAgent?: string`
* PostgreSQL: `installer_name text` <-> TypeScript: `installerName?: string`
* PostgreSQL: `slot_time text` <-> TypeScript: `slotTime?: string`
* PostgreSQL: `contractor_id text REFERENCES public.contractors(id)` <-> TypeScript: `contractorId?: string`
* PostgreSQL: `payload jsonb` <-> TypeScript: Dynamic & legacy fields (e.g., optical power readings, coordinates, audit references)

### 3.3. `technical_reports` Table Mapping
* PostgreSQL: `id text PRIMARY KEY` <-> TypeScript: `id: string`
* PostgreSQL: `work_order_id text REFERENCES public.work_orders(id)` <-> TypeScript: `ticketId: string`
* PostgreSQL: `wo_number text NOT NULL` <-> TypeScript: `woNumber: string`
* PostgreSQL: `submitted_by text NOT NULL` <-> TypeScript: `submittedBy: string` (Authoritative field for installer/technician identity)
* PostgreSQL: `work_result text NOT NULL` <-> TypeScript: `workResult: string` (Completion state: `COMPLETED`, `PENDING_PARTS`, etc.)
* PostgreSQL: `optical_power_rx text` <-> TypeScript: `opticalPowerRx?: string`
* PostgreSQL: `optical_power_dbm text` <-> TypeScript: `opticalPowerDbm?: string`
* PostgreSQL: `verified_by_dispatch boolean NOT NULL DEFAULT false` <-> TypeScript: `verifiedByDispatch: boolean`
* PostgreSQL: `verified_at timestamptz` <-> TypeScript: `verifiedAt?: string`
* PostgreSQL: `verified_by text` <-> TypeScript: `verifiedBy?: string`
* PostgreSQL: `photos jsonb DEFAULT '[]'::jsonb` <-> TypeScript: `photos?: string[]`

---

## 4. Reconciliation Verification Verdict

* **Total Canonical Tables Audited:** 22
* **Schema Drift / Missing Columns:** 0
* **Type Definition Parity:** 100% Type-Safe in `server/supabaseAdapter.ts` and `src/types/index.ts`
* **Compilation Status:** `tsc --noEmit` and Vite build succeeded with 0 errors.
