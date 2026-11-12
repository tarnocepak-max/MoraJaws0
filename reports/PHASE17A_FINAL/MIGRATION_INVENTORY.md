# MORAJAWS — MIGRATION INVENTORY & SHA-256 REGISTRY
## Complete Catalogue of 21 Migration Files in `migrations/`

**Document ID:** MORAJAWS-PHASE17A-INV-001  
**Audit Date:** 2025-02-17  
**Scope:** All files residing in `/migrations/`  

---

### 1. Cryptographic File Inventory

| # | Filename | Size (Bytes) | SHA-256 Checksum | Category / Target |
| :- | :--- | :-: | :--- | :--- |
| 1 | `001_core_morajaws_schema.sql` | 13,017 | `f0d263b5d62aefe4cb69122d49f78edbdadbce43b58b90ca51aac7760d6d9ab0` | Base Public Schema |
| 2 | `002_schema_corrections.sql` | 13,017 | `f0d263b5d62aefe4cb69122d49f78edbdadbce43b58b90ca51aac7760d6d9ab0` | **DUPLICATE OF 001** |
| 3 | `003_role_and_assignment_hardening.sql` | 5,595 | `2eb734cb8ee3a479b4beea3bba3f00e84ecf8df00dc89eb86d63cb4a92c0ee91` | Roles & Work Orders |
| 4 | `004_fix_reports_and_logs.sql` | 4,213 | `d3e0996841f237efb747376a3036c012ee182be57ec8d2a45be434a991f274cb` | Reports & Logs |
| 5 | `005_fix_auth_users_foreign_keys.sql` | 5,164 | `30a7d5bbbf0ba0d375d0b9cc7fbf2f638f38dbe39f8be813f8c5b16e4544fb1b` | Legacy `auth.users` FK |
| 6 | `006_custom_authentication_schema.sql` | 6,950 | `dfc29f63503c5304618fb9079fbe567a5b39977aa8dd49206ea5a706e2329930` | Custom Auth (`users`, `auth_sessions`) |
| 7 | `006_phase16a_schema_alignment_and_droplists.sql` | 7,651 | `6ec37db7bb3fc5cf50900fdf01438ca661c9e88b6305a49c4f1c9c99ec9ba3f9` | **PREFIX COLLISION (006)** |
| 8 | `007_phase16a2_1_preflight_schema_audit.sql` | 5,096 | `3d6d066b59fc8ff81efd36f862fe5ec8bb2be979c656372ca9f563795d36e766` | **PREFIX COLLISION (007)** (Advisory) |
| 9 | `007_phase16a2_rollback_plan.sql` | 3,924 | `1f362ae75f3a0977d4653f2257d0fce7c09c25f46399c258d4aebc8d48d61745` | **PREFIX COLLISION (007)** (Rollback) |
| 10 | `007_phase16a2_staging_account_alignment_reference.sql` | 7,690 | `5019313db56346aa8612741dd0be8619bc451b744a492fb8a3aa822bb97f7f3f` | **PREFIX COLLISION (007)** (Reference) |
| 11 | `007_phase16a2_staging_schema_initialization.sql` | 9,997 | `ba5d8205f43db4878b17b5f25bfca0ffabcbfe47fa0ec5b778248c5e62fba2ca` | **PREFIX COLLISION (007)** (Staging Init) |
| 12 | `007_provision_primary_superadmin.sql` | 2,875 | `6a9a7b9319a27b87640f06f5c879d747d95655aa9aeaa44e3cc1d585ca454226` | **PREFIX COLLISION (007)** (Admin Seed) |
| 13 | `008_verify_production_schema.sql` | 6,552 | `4d2ca7802422bdf7950c05fe9bf31a74288022b7c6c4c01ff00ec778cb952327` | Audit / Verification |
| 14 | `009_auth_sessions_and_token_rotation.sql` | 5,862 | `a90d96d9fa24ecae9e1b7dbfbff84081c7ffcc08754b23145d5a2305a2f5ff83` | Token Rotation RPCs |
| 15 | `010_complete_custom_auth_cutover.sql` | 6,664 | `3ecf3b46949f55e0a6d0dfc08f43dfc6a382103f19e4aa1a4c81fce8c005fbc0` | Auth Cutover Trigger |
| 16 | `011_fix_technical_reports_schema.sql` | 6,539 | `971ef28ebc96f24d775ea091d3d63b2cf4f796216a9a3048cc2840ef77c229cf` | Technical Reports Schema |
| 17 | `012_technical_reports_atomic_submission.sql` | 5,160 | `735f47dd840b2a8d3e921d7b38cb7ffc01aee22b700f135b3be282f939e6a0d4` | Report Submission RPC v1 |
| 18 | `013_fix_technical_reports_jsonb_handling.sql` | 5,595 | `20fa493231362e5a7ce974514a600371e16f7281313788226e100f7e44a42ff3` | Report Submission RPC v2 |
| 19 | `014_fix_technical_reports_photo_columns.sql` | 5,876 | `c0feeb6e9196b6bf091fe8c7151bc4f631df83e65ee7a3038d17ee339bb58f58` | Report Submission RPC v3 |
| 20 | `015_phase2_5_internal_auth_rls_lockdown.sql` | 5,091 | `2467d13eb1691a7eb3f35ee3f31cf6455cead7c784ee0d853b02dd1d0630df26` | RLS Lockdown (`service_role`) |
| 21 | `016_production_work_order_import_pipeline.sql` | 10,774 | `b7381eb227bcad022dd70f3fbb291a10fbdd286374dae5e783ae184db4377033` | WO Import Pipeline & RPCs |

---

### 2. Critical Detailed Breakdown

#### A. Identical Duplicate Files
- **Files:** `001_core_morajaws_schema.sql` vs `002_schema_corrections.sql`
- **Byte Size:** 13,017 bytes each.
- **SHA-256:** `f0d263b5d62aefe4cb69122d49f78edbdadbce43b58b90ca51aac7760d6d9ab0`
- **Impact:** Running both migrations sequentially on a fresh database will attempt to re-execute table creations, leading to `relation already exists` errors if `CREATE TABLE` without `IF NOT EXISTS` is hit, or redundant DDL execution.

#### B. The 006 Prefix Collision
- `006_custom_authentication_schema.sql`:
  - Purpose: Provisions custom `users`, `auth_sessions`, password hashing fields, and core auth tables.
  - Dependencies: PostgreSQL `pgcrypto`, `uuid-ossp`.
- `006_phase16a_schema_alignment_and_droplists.sql`:
  - Purpose: Introduces `contractors`, `coverage_areas`, alterations on `work_orders`, and attempts references to `auth.users(id)`.
  - Collision Risk: Migration runners ordering by filename string may execute these in non-deterministic order, causing conflicting schema states.

#### C. The 007 Prefix 5-Way Collision
Five files share the prefix `007`:
1. `007_phase16a2_1_preflight_schema_audit.sql`: Contains SELECT statements and verification notices; not an idempotent DDL migration.
2. `007_phase16a2_rollback_plan.sql`: Reversal script designed to drop tables; catastrophic if run automatically during forward migration.
3. `007_phase16a2_staging_account_alignment_reference.sql`: Informational queries and comments.
4. `007_phase16a2_staging_schema_initialization.sql`: Full DDL initialization for staging environment.
5. `007_provision_primary_superadmin.sql`: Inserts hardcoded superadmin user into `public.users`.
- **Verdict:** Prefix `007` represents an unmanaged operational directory rather than a deterministic linear migration chain.
