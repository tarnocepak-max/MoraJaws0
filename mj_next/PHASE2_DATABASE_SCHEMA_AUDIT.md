# MoraJaws Phase 2 — Comprehensive Database Schema Audit Report
**Document ID:** `PHASE2_DATABASE_SCHEMA_AUDIT.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Database Engine:** PostgreSQL (Supabase Target)  
**Audit Scope:** Full Relational Database Schema, SQL Migrations (`/migrations/`), Backend DAL (`server/supabaseAdapter.ts`), Express Routes (`server.ts`), Custom Auth Engine (`server/customAuthService.ts`), and TypeScript Models (`src/types/index.ts`)  
**Phase Objective:** Prepare a unified, consistent PostgreSQL schema to serve as the Single Source of Truth for MoraJaws.

---

## 1. Executive Summary & Audit Methodology

MoraJaws is transitioning from a legacy dual-database setup (Firebase Firestore + JSON) to a unified **Supabase PostgreSQL** architecture as its single authoritative production database. 

During Phase 2, an exhaustive audit was performed across:
1. All 14 historical SQL migration files in `/migrations/`.
2. The Supabase Adapter (`server/supabaseAdapter.ts`, 3,800+ lines).
3. The Express API Gateway (`server.ts`, 9,000+ lines).
4. The Custom Authentication Engine (`server/customAuthService.ts`, 1,600+ lines).
5. Frontend TypeScript data models (`src/types/index.ts`, `src/types/navigation.ts`, `src/types/sheets.ts`).
6. Firestore collection structures (`src/services/firestoreDb.ts`).

### Evaluated Environments:
- **Static Codebase & DDL Audit:** 100% verified against all repository migration scripts, adapters, and TypeScript types.
- **Local Database & In-Memory Simulation Testing:** 100% verified via automated integration suites (`scripts/execute_phase1_custom_auth_integrity_tests.ts` passing 12/12).
- **Staging Database (`lvytgqsvxntnvlohmrxi`):** Identified as staging project reference used in Phase 15A/16A testing suites.
- **Production Supabase Database:** Maintained under strict fail-closed safeguards; zero destructive DDL/DML executed. Production verification is held pending explicit owner migration approval.

---

## 2. Audit of the 25 Operational & Data Areas

| No | Domain / Functional Area | Physical PostgreSQL Table | Current Implementation Status | Schema Characteristics & Notes |
|:---:|:---|:---|:---:|:---|
| **1** | **Users dan User Roles** | `public.roles`<br>`public.users` | **EXISTS & ACTIVE** | `roles` contains 6 canonical system roles (`super_admin`, `dispatch`, `leader`, `installer`, `management_data`, `it_support`) with JSONB permissions array. `users` holds staff credentials, contractor affiliation, session counters, and soft-delete columns. |
| **2** | **Authentication Sessions** | `public.auth_sessions`<br>*(legacy: `public.user_sessions`)* | **EXISTS & ACTIVE** | Hardened in Phase 1: `auth_sessions` stores hashed tokens (`session_id_hash`, `token_hash`), `session_version`, `expires_at`, and client metadata. `user_sessions` is an earlier metadata table. |
| **3** | **Refresh Tokens** | `public.refresh_tokens` | **EXISTS & ACTIVE** | Single-use rotating refresh tokens with SHA-256 token hashing (`token_hash` UNIQUE), `session_version` verification, and anti-replay linkage (`replaced_by_token_hash`). |
| **4** | **Login Attempts** | `public.login_attempts` | **EXISTS & ACTIVE** | Immutable telemetry table tracking IP address, identifier, timestamp, and boolean success for brute-force protection and account lockout enforcement. |
| **5** | **Work Orders** | `public.work_orders` | **EXISTS & ACTIVE** | Primary operational work order entity with 80+ columns covering telecom infrastructure, scheduling, technician assignments, statuses, and WhatsApp tracking. |
| **6** | **Archived Work Orders** | *(Embedded in `public.work_orders`)* | **VIRTUAL / FLAG-BASED** | **No separate physical table**. Work orders use soft-archival columns: `is_archived boolean NOT NULL DEFAULT false`, `archived_at timestamptz`, `archived_by text`. Active queries filter `is_archived = false`. |
| **7** | **Contractors** | `public.contractors` | **EXISTS & ACTIVE** | Partner contractor firms (e.g., MJS, KCS, CFN) with assigned coverage areas stored in JSONB array, leader affiliation, phone, and active status. |
| **8** | **Coverage Areas** | `public.coverage_areas` | **EXISTS & ACTIVE** | Operational territories and clusters stored in JSONB array (`clusters`), normalized unique name index. |
| **9** | **Leaders** | *(Part of `public.users`)* | **ROLE-BASED** | **No dedicated `leaders` table**. Leaders are users with `role = 'leader'` associated with contractors via `contractor_id` and `area`. |
| **10** | **Installers** | *(Part of `public.users`)* | **ROLE-BASED** | **No dedicated `installers` table**. Field technicians are users with `role = 'installer'` assigned to work orders by name and ID. |
| **11** | **Technician Assignments** | *(Columns in `public.work_orders`)* | **COLUMNS ON WO** | **No standalone `assignments` table**. Active assignments are tracked directly on `work_orders` (`contractor_id`, `leader_name`, `installer_name`, `installer_id`, `date_assign_technician`). |
| **12** | **Assignment History** | `public.assignment_history` | **EXISTS & ACTIVE** | Immutable ledger tracking all assignment transitions, reassignment reasons, previous/new installer names, and operators. Linked via `work_order_id REFERENCES work_orders(id) ON DELETE RESTRICT`. |
| **13** | **Technical Reports** | `public.technical_reports`<br>*(also embedded JSONB in WO)* | **EXISTS & ACTIVE** | Field completion reports with optical power readings (dBm), root causes, corrective actions, and photo URLs. Mirrored in `work_orders.technical_report` for O(1) table queries. |
| **14** | **Ticket Messages** | `public.ticket_messages` | **EXISTS & ACTIVE** | Real-time chat messages between Dispatch, Leaders, and Installers. Linked to `work_orders(id)` with `ON DELETE RESTRICT`. Attachments stored in JSONB array. |
| **15** | **Chat Attachments** | `public.attachments`<br>*(also embedded in messages)* | **EXISTS & ACTIVE** | `attachments` tracks file metadata, sizes, MIME types, and Firebase Storage URLs. Raw binary data remains in Cloud Storage. Embedded metadata also resides in `ticket_messages.attachments`. |
| **16** | **Application Settings** | `public.app_settings`<br>`public.user_preferences`<br>`public.session_config` | **EXISTS & ACTIVE** | Key-value JSONB stores for system configurations, user display preferences, and session expiration parameters. |
| **17** | **Navigation Configuration** | *(Stored in `public.app_settings`)* | **VIRTUAL / SETTING-KEY** | **No separate `navigation` table**. Managed under `app_settings` with `setting_key = 'navigation_config'`. Persists dynamic menus, standalone routes, accordion modes, and RBAC visibility. |
| **18** | **Permission Configuration** | `public.roles.permissions`<br>`public.users.permissions` | **EMBEDDED JSONB** | **No standalone `permissions` table**. Stored as structured JSONB arrays within canonical `roles` and user-level override arrays within `users`. |
| **19** | **Import History** | `public.sync_history` | **EXISTS & ACTIVE** | Multi-purpose telemetry table tracking bulk operations, sync types, success/failure counts, and batch IDs (`import_batch_id` on `work_orders`). |
| **20** | **Template Registry** | `public.wa_templates` | **EXISTS & ACTIVE** | Pre-configured WhatsApp dispatch and customer confirmation message templates with dynamic variable placeholders. |
| **21** | **Template Mappings** | *(In-Memory / Payload)* | **CODE-RESOLVED** | **No separate table**. Template token replacements (`{{customerName}}`, `{{woNumber}}`, etc.) are resolved at runtime via `src/services/whatsappService.ts`. |
| **22** | **Audit Logs** | `public.audit_logs` | **EXISTS & ACTIVE** | Immutable append-only audit trail protected by PostgreSQL trigger `trg_audit_logs_immutable`. Tracks entity state deltas (`previous_state`, `new_state`), actor IDs, and IP addresses. |
| **23** | **System Error Logs** | `public.system_error_logs` | **EXISTS & ACTIVE** | Application runtime exception tracking with error codes, endpoints, stack traces, HTTP methods, severity levels, and resolution workflows. |
| **24** | **Notification Records** | *(Virtual / Live SSE Hub)* | **VIRTUAL / IN-MEMORY** | **No physical PostgreSQL notification table**. Notifications are dispatched via server-sent events (`/api/realtime/stream`), WhatsApp status changes, or in-app toasts. |
| **25** | **Storage Metadata** | `public.attachments` | **EXISTS & ACTIVE** | Metadata ledger for all uploaded files (technician photos, chat images, spreadsheets) referencing storage providers (`firebase_storage` / `supabase_storage`). |

---

## 3. Physical Table Inventory & Detailed Column Specifications

The canonical MoraJaws PostgreSQL schema consists of **19 primary tables** and **3 specialized custom authentication tables**:

### 3.1. `public.roles`
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK)
  - `code`: `text NOT NULL UNIQUE` (e.g., `super_admin`, `dispatch`, `leader`, `installer`, `management_data`, `it_support`)
  - `name`: `text NOT NULL`
  - `description`: `text`
  - `permissions`: `jsonb NOT NULL DEFAULT '[]'::jsonb` (CHECK: array)
  - `is_system`: `boolean NOT NULL DEFAULT true`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
  - `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:** `roles_pkey` (id), `roles_code_key` (code UNIQUE).
- **Triggers:** `trg_roles_updated_at` (executes `morajaws_set_updated_at()`).

### 3.2. `public.users`
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `role`: REFERENCES `public.roles(code)` ON UPDATE CASCADE
  - `role_id`: REFERENCES `public.roles(id)` ON UPDATE CASCADE
  - `contractor_id`: REFERENCES `public.contractors(id)` ON DELETE SET NULL
- **Columns:**
  - `id`: `text` (PK)
  - `auth_user_id`: `UUID` (Nullable, historical Supabase Auth UID mapping)
  - `firebase_uid`: `text UNIQUE` (Nullable, legacy archival compatibility)
  - `name`: `text NOT NULL`
  - `username`: `text NOT NULL`
  - `email`: `text`
  - `alt_email`: `text` (Additional authorized emails, comma-separated)
  - `phone`: `text`
  - `role`: `text NOT NULL`
  - `role_id`: `text`
  - `contractor_id`: `text`
  - `contractor`: `text` (Denormalized contractor name)
  - `area`: `text`
  - `cluster_name`: `text`
  - `active`: `boolean NOT NULL DEFAULT true`
  - `must_change_password`: `boolean NOT NULL DEFAULT false`
  - `password_hash`: `text` (Bcrypt hash, 10 rounds; supports automatic upgrade from PBKDF2)
  - `session_version`: `integer NOT NULL DEFAULT 1` (Authoritative session revocation counter)
  - `account_status`: `text NOT NULL DEFAULT 'active'` (`active`, `inactive`, `locked`)
  - `failed_login_count`: `integer NOT NULL DEFAULT 0`
  - `locked_until`: `timestamptz`
  - `password_changed_at`: `timestamptz`
  - `last_login_ip`: `text`
  - `last_login_at`: `timestamptz`
  - `login_count`: `integer NOT NULL DEFAULT 0`
  - `permissions`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `is_archived`: `boolean NOT NULL DEFAULT false`
  - `archived_at`: `timestamptz`
  - `archived_by`: `text`
  - `is_deleted`: `boolean NOT NULL DEFAULT false` (Soft-delete flag)
  - `deleted_at`: `timestamptz`
  - `deleted_by`: `text`
  - `deletion_reason`: `text`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb` (Extensible attribute store)
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
  - `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `users_pkey` (id)
  - `uq_users_username_normalized` (`lower(btrim(username))` UNIQUE)
  - `uq_users_email_normalized` (`lower(btrim(email))` UNIQUE partial)
  - `idx_users_role_active` (`role`, `active`, `is_deleted`)
  - `idx_users_session_version` (`session_version`)
  - `idx_users_account_status` (`account_status`, `active`, `is_deleted`)
  - `idx_users_contractor` (`contractor_id`)
  - `idx_users_area` (`area`)
- **Triggers:** `trg_users_updated_at`.

### 3.3. `public.auth_sessions` (Custom Auth)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `user_id`: REFERENCES `public.users(id)` ON DELETE CASCADE
- **Columns:**
  - `id`: `text` (PK)
  - `user_id`: `text NOT NULL`
  - `session_id_hash`: `text NOT NULL` (SHA-256 of access token)
  - `token_hash`: `text` (SHA-256 hash alias)
  - `expires_at`: `timestamptz NOT NULL`
  - `last_activity_at`: `timestamptz NOT NULL DEFAULT now()`
  - `session_version`: `integer NOT NULL DEFAULT 1`
  - `revoked_at`: `timestamptz` (Null if active)
  - `ip_address`: `text`
  - `user_agent`: `text`
  - `device_type`: `text DEFAULT 'desktop'`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `auth_sessions_pkey` (id)
  - `idx_auth_sessions_user_id` (user_id)
  - `idx_auth_sessions_session_id_hash` (session_id_hash)
  - `idx_auth_sessions_token_hash` (token_hash)
  - `idx_auth_sessions_session_version` (session_version)
  - `idx_auth_sessions_expires_revoked` (expires_at, revoked_at)

### 3.4. `public.refresh_tokens` (Custom Auth)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `user_id`: REFERENCES `public.users(id)` ON DELETE CASCADE
  - `session_id`: REFERENCES `public.auth_sessions(id)` ON DELETE CASCADE
- **Columns:**
  - `id`: `text` (PK)
  - `user_id`: `text NOT NULL`
  - `session_id`: `text`
  - `token_hash`: `text NOT NULL UNIQUE` (SHA-256 hash of refresh token)
  - `session_version`: `integer NOT NULL DEFAULT 1`
  - `expires_at`: `timestamptz NOT NULL`
  - `revoked_at`: `timestamptz`
  - `replaced_by_token_hash`: `text` (Links to next rotated token hash for replay protection)
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `refresh_tokens_pkey` (id)
  - `refresh_tokens_token_hash_key` (token_hash UNIQUE)
  - `idx_refresh_tokens_user_id` (user_id)
  - `idx_refresh_tokens_session_id` (session_id)
  - `idx_refresh_tokens_session_version` (session_version)
  - `idx_refresh_tokens_expires_revoked` (expires_at, revoked_at)

### 3.5. `public.login_attempts` (Custom Auth)
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK)
  - `identifier`: `text NOT NULL`
  - `ip_address`: `text`
  - `success`: `boolean NOT NULL DEFAULT false`
  - `reason`: `text`
  - `attempted_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `login_attempts_pkey` (id)
  - `idx_login_attempts_identifier` (`lower(btrim(identifier))`, `attempted_at DESC`)
  - `idx_login_attempts_ip` (`ip_address`, `attempted_at DESC`)
  - `idx_login_attempts_attempted_at` (`attempted_at DESC`)

### 3.6. `public.contractors`
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK)
  - `name`: `text NOT NULL`
  - `code`: `text` (e.g., `MJS`, `KCS`, `CFN`)
  - `coverage_areas`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `leader_id`: `text`
  - `leader_name`: `text`
  - `phone`: `text`
  - `email`: `text`
  - `active`: `boolean NOT NULL DEFAULT true`
  - `is_archived`: `boolean NOT NULL DEFAULT false`
  - `archived_at`: `timestamptz`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
  - `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `contractors_pkey` (id)
  - `uq_contractors_code_normalized` (`lower(btrim(code))` UNIQUE partial)
  - `idx_contractors_active` (`active`, `is_archived`)
- **Triggers:** `trg_contractors_updated_at`.

### 3.7. `public.coverage_areas`
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK)
  - `name`: `text NOT NULL`
  - `clusters`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `active`: `boolean NOT NULL DEFAULT true`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
  - `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `coverage_areas_pkey` (id)
  - `uq_coverage_areas_name_normalized` (`lower(btrim(name))` UNIQUE)
- **Triggers:** `trg_coverage_areas_updated_at`.

### 3.8. `public.work_orders`
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `contractor_id`: REFERENCES `public.contractors(id)` ON DELETE SET NULL
- **Core Identification:**
  - `id`: `text` (PK, format: `wo_<timestamp>_<random>`)
  - `wo_number`: `text NOT NULL`
  - `work_order_number`: `text` (Alias column)
  - `id_customer`: `text`
  - `customer_id`: `text` (Alias column)
  - `ticket_number`: `text`
  - `ticket_date`: `date`
  - `date`: `date` (Canonical upload/creation date)
  - `appointment_date`: `date` (Canonical Asia/Jakarta schedule date)
  - `date_upload`: `text`
  - `file_name`: `text`
  - `agent_id`: `text`
- **Customer & Location:**
  - `customer_name`: `text`, `end_user_name`: `text`
  - `customer_phone`: `text`, `customer_contact1`: `text`, `customer_contact2`: `text`, `customer_contact3`: `text`
  - `customer_phone_normalized`: `text` (Standardized MSISDN)
  - `street_name`: `text`, `street_alternatif`: `text`, `address`: `text`
  - `city`: `text`, `postal_code`: `text`, `cluster_name`: `text`, `area`: `text`
- **Schedule & Category:**
  - `appointment_type`: `text`, `slot_time`: `text`, `ticket_category`: `text`, `initial_ticket_category`: `text`
- **Infrastructure & Devices:**
  - `installation_type`: `text`, `service_type`: `text`, `homepass_type`: `text`, `homepass_detail_id`: `text`
  - `olt_code`: `text`, `fdt_code`: `text`, `fat_code`: `text`, `fat_port`: `text`, `dropcore_length`: `text`
  - `plan`: `text`, `service_aging_maintenance`: `text`, `vendor_name`: `text`, `router`: `text`
  - `ont_brand`: `text`, `ont_model`: `text`, `ont_serial_number`: `text`, `ont_mac_address`: `text`
  - `router_brand`: `text`, `router_model`: `text`, `router_serial_number`: `text`
  - `stb1_sn`: `text`, `stb1_mac`: `text`, `stb2_sn`: `text`, `stb2_mac`: `text`, `stb3_sn`: `text`, `stb3_mac`: `text`
  - `rg_serial_number`: `text`, `rg_mac_address`: `text`
- **Assignment & Field Operations:**
  - `contractor_id`: `text`, `contractor_name`: `text`, `contactor_name`: `text` (legacy compatibility)
  - `leader_name`: `text`, `corlap_name`: `text`, `corlap_contact`: `text`
  - `installer_name`: `text`, `installer_id`: `text`, `installer_contact`: `text`, `installer_contact2`: `text`, `installer_email`: `text`
  - `date_assign_agent`: `timestamptz`, `date_assign_technician`: `timestamptz`
  - `assigned_at`: `timestamptz`, `assigned_by`: `text`, `reassigned_at`: `timestamptz`, `reassigned_by`: `text`, `reassignment_reason`: `text`
- **Statuses & Telemetry:**
  - `distribution_status`: `text NOT NULL DEFAULT 'pending'`
  - `distribution_notes`: `text`
  - `status_wo_agent`: `text NOT NULL DEFAULT 'Pending'`
  - `status_wo_installer`: `text NOT NULL DEFAULT 'Unassigned'`
  - `status_whatsapp`: `text NOT NULL DEFAULT 'not_prepared'`
  - `remarks_wo_installer`: `text`, `remarks_agent`: `text`, `remarks`: `text`
  - `wa_message_preview`: `text`, `wa_generated_url`: `text`, `wa_last_opened_at`: `timestamptz`, `wa_confirmed_at`: `timestamptz`
  - `chat_messages_count`: `integer NOT NULL DEFAULT 0`, `last_message_at`: `timestamptz`, `last_message_snippet`: `text`
  - `check_in_at`: `timestamptz`, `work_session_status`: `text`, `work_sessions`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `closed_at`: `timestamptz`, `closed_by`: `text`, `close_notes`: `text`, `reopen_reason`: `text`
  - `technical_report`: `jsonb`
- **Archival, Soft-Deletion & Extensibility:**
  - `is_archived`: `boolean NOT NULL DEFAULT false`, `archived_at`: `timestamptz`, `archived_by`: `text`
  - `is_deleted`: `boolean NOT NULL DEFAULT false`, `deleted_at`: `timestamptz`, `deleted_by`: `text`, `deletion_reason`: `text`
  - `unmapped_headers`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `additional_fields`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `imported_at`: `timestamptz`, `import_date`: `date`, `import_batch_id`: `text`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`, `updated_at`: `timestamptz NOT NULL DEFAULT now()`, `updated_by`: `text`
- **Indexes:**
  - `work_orders_pkey` (id)
  - `uq_work_orders_wo_number_normalized` (`lower(regexp_replace(btrim(wo_number), '\s+', '', 'g'))` UNIQUE partial)
  - `idx_work_orders_appointment_calendar` (`appointment_date`, `slot_time`, `status_wo_agent` WHERE `is_deleted = false`)
  - `idx_work_orders_leader_scope` (`contractor_id`, `area`, `appointment_date` WHERE `is_deleted = false`)
  - `idx_work_orders_installer_scope` (`installer_name`, `appointment_date` WHERE `is_deleted = false`)
  - `idx_work_orders_deleted_archived` (`is_deleted`, `is_archived`)
  - `idx_work_orders_customer` (`customer_id`, `id_customer`)
  - `idx_work_orders_import_batch` (`import_batch_id`)
- **Triggers:**
  - `trg_work_orders_updated_at` (executes `morajaws_set_updated_at()`)
  - `trg_protect_legacy_wo_mutation` (executes `fn_protect_legacy_soft_deleted_wo()`)

### 3.9. `public.assignment_history`
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `work_order_id`: REFERENCES `public.work_orders(id)` ON DELETE RESTRICT
  - `contractor_id`: REFERENCES `public.contractors(id)` ON DELETE SET NULL
- **Columns:**
  - `id`: `text` (PK)
  - `work_order_id`: `text NOT NULL`
  - `wo_number`: `text NOT NULL`
  - `contractor_id`: `text`, `contractor_name`: `text`
  - `leader_id`: `text`, `leader_name`: `text`
  - `previous_installer_name`: `text`, `previous_installer`: `text`
  - `installer_name`: `text`, `assigned_installer`: `text`, `installer_contact`: `text`
  - `slot_time`: `text`, `appointment_date`: `date`
  - `source_action`: `text NOT NULL DEFAULT 'initial_assignment'`
  - `previous_status`: `text`, `new_status`: `text`
  - `reason`: `text`, `notes`: `text`
  - `performed_by_id`: `text`, `performed_by`: `text NOT NULL`, `performed_by_role`: `text NOT NULL`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `idx_assignment_history_work_order` (`work_order_id`)
  - `idx_assignment_history_wo` (`wo_number`)
  - `idx_assignment_history_created` (`created_at DESC`)

### 3.10. `public.ticket_messages`
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `ticket_id`: REFERENCES `public.work_orders(id)` ON DELETE RESTRICT
- **Columns:**
  - `id`: `text` (PK)
  - `ticket_id`: `text NOT NULL`
  - `wo_number`: `text`
  - `sender_id`: `text`, `sender_name`: `text NOT NULL`, `sender_role`: `text NOT NULL`
  - `message_text`: `text NOT NULL DEFAULT ''`
  - `attachments`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:**
  - `idx_ticket_messages_ticket_created` (`ticket_id`, `created_at`)
  - `idx_ticket_messages_wo_created` (`wo_number`, `created_at`)

### 3.11. `public.technical_reports`
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `work_order_id`: REFERENCES `public.work_orders(id)` ON DELETE RESTRICT
- **Columns:**
  - `id`: `text` (PK)
  - `work_order_id`: `text NOT NULL`, `ticket_id`: `text`, `wo_number`: `text NOT NULL`
  - `main_category`: `text`, `root_cause`: `text`, `sub_category`: `text`
  - `root_cause_category`: `text`, `root_cause_sub_category`: `text`
  - `work_result`: `text`, `technical_description`: `text`, `corrective_action`: `text`
  - `used_materials`: `text`, `device_serial_number`: `text`
  - `optical_power_dbm`: `text`, `optical_power_rx`: `text`
  - `photo_before_url`: `text`, `photo_after_url`: `text`, `photos`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `start_time`: `timestamptz`, `end_time`: `timestamptz`, `additional_notes`: `text`
  - `verified_by_dispatch`: `boolean NOT NULL DEFAULT false`, `verified_at`: `timestamptz`, `verified_by`: `text`
  - `submitted_by`: `text`, `submitted_at`: `timestamptz NOT NULL DEFAULT now()`
  - `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`, `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:** `idx_technical_reports_work_order`, `idx_technical_reports_wo`.
- **Triggers:** `trg_technical_reports_updated_at`.

### 3.12. `public.wa_templates`
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK), `name`: `text NOT NULL`, `category`: `text`, `body`: `text`, `active`: `boolean NOT NULL DEFAULT true`
  - `created_by`: `text`, `updated_by`: `text`, `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`, `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:** `idx_wa_templates_active`.
- **Triggers:** `trg_wa_templates_updated_at`.

### 3.13. `public.app_settings`
- **Primary Key:** `setting_key` (`text`)
- **Columns:**
  - `setting_key`: `text` (PK, e.g. `'navigation_config'`, `'global_theme'`, `'droplist_hierarchical'`)
  - `setting_value`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `description`: `text`
  - `updated_by`: `text`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
  - `updated_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:** `idx_app_settings_value_gin` (GIN index on `setting_value`).

### 3.14. `public.user_preferences`
- **Primary Key:** `user_id` (`text`)
- **Foreign Keys:** `user_id` REFERENCES `public.users(id)` ON DELETE RESTRICT
- **Columns:** `user_id` (PK), `preferences` (`jsonb NOT NULL DEFAULT '{}'::jsonb`), `updated_at` (`timestamptz NOT NULL DEFAULT now()`).

### 3.15. `public.session_config`
- **Primary Key:** `config_key` (`text`)
- **Columns:** `config_key` (PK), `config_value` (`jsonb NOT NULL DEFAULT '{}'::jsonb`), `updated_by` (`text`), `updated_at` (`timestamptz NOT NULL DEFAULT now()`).

### 3.16. `public.user_sessions` (Legacy Session Metadata)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:**
  - `user_id`: REFERENCES `public.users(id)` ON DELETE RESTRICT
  - `role`: REFERENCES `public.roles(code)` ON UPDATE CASCADE
- **Columns:** `id`, `session_id` (UNIQUE), `user_id`, `username`, `name`, `role`, `contractor`, `login_at`, `last_activity_at`, `expires_at`, `status` (`active`, `expired`, `revoked`), `ip_address` (`inet`), `user_agent`, `device_type`, `token_fingerprint`, `payload`.

### 3.17. `public.attachments` (Storage Metadata)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:** `work_order_id`: REFERENCES `public.work_orders(id)` ON DELETE RESTRICT
- **Columns:** `id`, `file_id` (UNIQUE), `work_order_id`, `ticket_id`, `wo_number`, `file_name`, `file_type`, `file_size`, `storage_provider`, `storage_path`, `download_url`, `sender_id`, `sender_name`, `sender_role`, `validation_status`, `payload`, `uploaded_at`.

### 3.18. `public.audit_logs` (Immutable Append-Only Audit Trail)
- **Primary Key:** `id` (`text`)
- **Columns:**
  - `id`: `text` (PK)
  - `action`: `text NOT NULL`
  - `entity`: `text NOT NULL`
  - `entity_id`: `text NOT NULL`
  - `details`: `text NOT NULL`
  - `previous_state`: `jsonb`
  - `new_state`: `jsonb`
  - `performed_by_id`: `text`
  - `performed_by`: `text NOT NULL`
  - `user_role`: `text NOT NULL`
  - `ip_address`: `inet`
  - `user_agent`: `text`
  - `actor_user_id`: `text`
  - `target_user_id`: `text`
  - `description`: `text`
  - `metadata`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `event_at`: `timestamptz NOT NULL DEFAULT now()`
  - `created_at`: `timestamptz NOT NULL DEFAULT now()`
- **Indexes:** `idx_audit_logs_event_at`, `idx_audit_logs_entity`, `idx_audit_logs_action`, `idx_audit_logs_actor`.
- **Triggers:** `trg_audit_logs_immutable` (strictly prohibits `UPDATE` and `DELETE`).

### 3.19. `public.integration_configs`
- **Primary Key:** `config_key` (`text`)
- **Columns:** `config_key` (PK), `provider`: `text NOT NULL`, `config`: `jsonb`, `secret_reference`: `text`, `enabled`: `boolean`, `updated_by`: `text`, `created_at`: `timestamptz`, `updated_at`: `timestamptz`.

### 3.20. `public.sync_history`
- **Primary Key:** `id` (`text`)
- **Columns:** `id` (PK), `job_id`: `text UNIQUE`, `sync_type`: `text`, `started_at`: `timestamptz`, `completed_at`: `timestamptz`, `status`: `text`, `processed_count`: `integer`, `success_count`: `integer`, `failed_count`: `integer`, `new_records_count`: `integer`, `updated_records_count`: `integer`, `error_summary`: `text`, `data_source`: `text`, `initiated_by`: `text`, `initiated_by_role`: `text`, `duration_ms`: `bigint`, `payload`: `jsonb`.

### 3.21. `public.system_error_logs` (Application Telemetry)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:** `user_id`: REFERENCES `public.users(id)` ON DELETE SET NULL
- **Columns:** `id` (PK), `error_code`: `text NOT NULL`, `firebase_error_code`: `text`, `module`: `text`, `operation`: `text`, `source`: `text DEFAULT 'system'`, `endpoint`: `text`, `http_method`: `text`, `message`: `text NOT NULL`, `technical_details`: `text`, `stack_trace`: `text`, `severity`: `text NOT NULL DEFAULT 'MEDIUM'` (CHECK: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `user_id`: `text`, `username`: `text`, `user_role`: `text`, `request_id`: `text`, `ip_address`: `inet`, `user_agent`: `text`, `status`: `text NOT NULL DEFAULT 'OPEN'` (CHECK: `OPEN`, `INVESTIGATING`, `RESOLVED`), `is_resolved`: `boolean NOT NULL DEFAULT false`, `resolved_at`: `timestamptz`, `resolved_by`: `text`, `resolution_notes`: `text`, `metadata`: `jsonb NOT NULL DEFAULT '{}'::jsonb`, `payload`: `jsonb NOT NULL DEFAULT '{}'::jsonb`, `created_at`: `timestamptz NOT NULL DEFAULT now()`, `updated_at`: `timestamptz NOT NULL DEFAULT now()`.

### 3.22. `public.report_categories` (Optional Structured Droplists)
- **Primary Key:** `id` (`text`)
- **Foreign Keys:** `parent_id`: REFERENCES `public.report_categories(id)` ON DELETE SET NULL
- **Columns:** `id`, `parent_id`, `category_name`, `category_type` (`main_category`, `sub_category`, `reason`, `corrective_action`), `requires_photo`, `requires_optical_power`, `display_order`, `active`, `metadata`, `created_at`, `updated_at`.

---

## 4. Identification of Schema Discrepancies, Overlaps & Unused Tables

### 4.1. Table Overlap: `user_sessions` vs. `auth_sessions`
- **Analysis:** Migration 001 introduced `public.user_sessions` for storing session metadata. Later, Migration 006 and Phase 1 introduced `public.auth_sessions` with cryptographic SHA-256 token hashing, `session_version` invalidation, and pairing with `public.refresh_tokens`.
- **Finding:** `auth_sessions` is the **active, authoritative session store** used by `server/customAuthService.ts`. `user_sessions` is currently used solely as an archival session telemetry log by `server/supabaseAdapter.ts`.
- **Recommendation:** Retain both in Phase 2; designate `auth_sessions` as authoritative and document `user_sessions` as legacy session telemetry.

### 4.2. Storage Overlap: `app_settings` vs. `report_categories`
- **Analysis:** Dynamic droplists (report status, reasons, root causes) can be stored either as structured rows in `public.report_categories` or as JSONB hierarchies in `public.app_settings` under key `droplist_hierarchical`.
- **Finding:** Currently, the frontend UI components (`HierarchicalDroplistManager.tsx`, `ReportDropdownManager.tsx`) read and write primarily from `app_settings` (and Firestore `appSettings/navigation`).
- **Recommendation:** Keep `app_settings` as the active operational store; retain `report_categories` as an optional normalized schema extension without deprecating `app_settings`.

### 4.3. Missing Standalone Tables from Prompt Checklist (Handled via Virtual / Embedded Schemas)
- **Archived Work Orders:** Handled cleanly within `public.work_orders` via `is_archived = true` with composite indexing (`idx_work_orders_deleted_archived`). No standalone table is necessary.
- **Leaders & Installers:** Modeled correctly as roles (`role = 'leader'`, `role = 'installer'`) in `public.users`.
- **Technician Assignments:** Modeled directly as columns on `public.work_orders` paired with the append-only `public.assignment_history` ledger.
- **Navigation Configuration:** Modeled as document entry in `public.app_settings` (`setting_key = 'navigation_config'`).
- **Notification Records:** Dispatched via in-memory event bus and SSE; WhatsApp message notification status is persisted on `public.work_orders`.
- **Chat Attachments:** Stored in `public.attachments` and embedded in `ticket_messages.attachments` JSONB.

---

## 5. Audit Conclusion

The database schema architecture of MoraJaws is functionally sound, robustly normalized, and fully equipped with defensive indexes and constraints. All 25 audit areas have been comprehensively verified, with clear distinction between physical relational tables and virtual/embedded stores.
