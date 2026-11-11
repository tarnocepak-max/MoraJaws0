# MoraJaws Phase 1 Database Migration Registry & Schema Alignment Report

**Date:** 2026-11-10  
**Phase:** MoraJaws Phase 1 (Database Migration Audit & Registry Analysis)  
**Database Engine:** PostgreSQL (Supabase)  
**Audit Scope:** Migrations Directory (`/migrations/`), Schema Definitions, Backend Query Alignment  

---

## 1. Migration Registry & Dependency Order

Berdasarkan audit komprehensif terhadap seluruh file SQL yang ada dalam direktori `/migrations/`, berikut adalah inventaris dan urutan dependensi migrasi MoraJaws:

| Urutan Dependensi | Nama File Migrasi | Deskripsi & Tujuan | Status Eksekusi |
|---|---|---|---|
| **001** | `001_core_morajaws_schema.sql` | Skema dasar inti MoraJaws: `roles`, `users`, `contractors`, `coverage_areas`, `work_orders`, `assignments`, `audit_logs`, `technical_reports`, `user_sessions`. | Baseline Core Schema |
| **002** | `002_schema_corrections.sql` | Perbaikan constraint dan penambahan field WO: `appointment_date`, `date_assign_technician`, `unmapped_headers`. | Baseline Patch |
| **003** | `003_system_error_logs_and_corrections.sql` | Penambahan tabel `system_error_logs` dan penyesuaian kolom log kesalahan. | Baseline Telemetry |
| **004** | `004_security_hardening_and_schema_preparation.sql` | Hardening RLS dasar, penambahan `sync_history`, penyesuaian indeks performa. | Security Hardening |
| **005** | `005_add_auth_user_id_to_users.sql` | Penambahan kolom `auth_user_id` (UUID) pada `public.users` untuk pemetaan auth. | Auth Bridge |
| **006-A** | `006_custom_authentication_schema.sql` | Skema Custom Authentication: modifikasi `users` (`password_hash`, `session_version`), pembuatan tabel `auth_sessions`, `refresh_tokens`, `login_attempts`, dan kebijakan RLS `service_role`. | **Active Custom Auth Schema** |
| **006-B** | `006_phase16a_schema_alignment_and_droplists.sql` | Draf proposal indeks komposit kalender/scoping, proteksi trigger 3 WO, tabel `report_categories`. | **DRAFT PROPOSAL (Numbering Conflict)** |
| **007-A** | `007_provision_primary_superadmin.sql` | Penyediaan akun utama Superadmin (`rays` / `rayhanafirzanx@gmail.com`) dengan PBKDF2 hash dan `session_version` increment. | **Primary Account Provisioning** |
| **007-B** | `007_phase16a2_staging_schema_initialization.sql` | Inisialisasi skema staging 19 tabel komprehensif untuk project staging `lvytgqsvxntnvlohmrxi`. | Staging Initialization |
| **007-C** | `007_phase16a2_1_preflight_schema_audit.sql` | Skrip SQL audit skema 100% read-only untuk memverifikasi struktur 19 tabel. | Read-Only Audit Tool |
| **007-D** | `007_phase16a2_staging_account_alignment_reference.sql` | Referensi penyelarasan akun staging. | Documentation / Reference |
| **007-E** | `007_phase16a2_rollback_plan.sql` | Rencana rollback Fase 16A.2. | Recovery Reference |
| **008** | `008_phase1_custom_auth_session_version_alignment.sql` | Penambahan non-destruktif kolom `session_version` pada `public.auth_sessions` dan `public.refresh_tokens`. | Session Alignment |
| **009 (BARU)** | `009_phase1_custom_auth_atomic_session_transaction.sql` | Fungsi PL/pgSQL atomik (`fn_create_auth_session_atomic`, `fn_rotate_refresh_token_atomic`, `fn_revoke_all_user_sessions_atomic`) dan indeks. | **Phase 1 Proposal (Non-Destructive)** |

---

## 2. Analisis Konflik Nomor Migrasi (Migration Numbering Conflicts)

Ditemukan dua anomali penomoran file migrasi:

### 2.1. Konflik Nomor 006
- Terdapat dua file migrasi dengan awalan `006_`:
  1. `006_custom_authentication_schema.sql` (fokus: Custom Auth tables)
  2. `006_phase16a_schema_alignment_and_droplists.sql` (fokus: WO composite indexes, report categories)
- **Rekomendasi Pemilik:** Pada Phase 2 nanti, file `006_phase16a_schema_alignment_and_droplists.sql` sebaiknya dinomori ulang menjadi `006b_...` atau `010_...` agar migration runner sekuensial otomatis tidak mengalami kebingungan urutan.

### 2.2. Multiplisitas Nomor 007
- Terdapat 5 file yang diawali `007_`:
  - `007_provision_primary_superadmin.sql`
  - `007_phase16a2_staging_schema_initialization.sql`
  - `007_phase16a2_1_preflight_schema_audit.sql`
  - `007_phase16a2_staging_account_alignment_reference.sql`
  - `007_phase16a2_rollback_plan.sql`
- **Mitigasi:** File selain `007_provision_primary_superadmin.sql` merupakan dokumen referensi, audit, dan konfigurasi staging. Tidak ada yang dieksekusi secara otomatis oleh backend saat startup.

---

## 3. Matriks Ketersediaan Kolom & Perbedaan Skema dengan Query Backend

### 3.1. Tabel `public.users`

| Kolom | Tipe Data | Di Migrasi Mana Dibuat? | Digunakan Backend? | Status & Catatan |
|---|---|---|---|---|
| `id` | `text` PK | 001 | Ya | Tersedia |
| `username` | `text` | 001 | Ya | Tersedia (Indexed lowercase) |
| `name` | `text` | 001 | Ya | Tersedia |
| `email` | `text` | 001 | Ya | Tersedia |
| `alt_email` | `text` | 007-B | Ya | Tersedia |
| `role` | `text` FK | 001 | Ya | Tersedia |
| `active` | `boolean` | 001 | Ya | Tersedia |
| `password_hash` | `text` | 001, 006 | Ya | Tersedia (Bcrypt / PBKDF2) |
| `session_version` | `integer` | 006, 008, 009 | Ya | **Kritis: Authoritative counter** |
| `must_change_password` | `boolean` | 006, 007-B | Ya | Tersedia |
| `account_status` | `text` | 006 | Ya | Tersedia (`active`, `locked`) |
| `failed_login_count` | `integer` | 006 | Ya | Tersedia (Lockout trigger) |
| `locked_until` | `timestamptz` | 006 | Ya | Tersedia |
| `is_deleted` | `boolean` | 001 | Ya | Tersedia (Soft delete) |
| `payload` | `jsonb` | 001 | Ya | Tersedia |

### 3.2. Tabel `public.auth_sessions`

| Kolom | Tipe Data | Di Migrasi Mana Dibuat? | Status Ketersediaan |
|---|---|---|---|
| `id` | `text` PK | 006 | Tersedia |
| `user_id` | `text` FK users | 006 | Tersedia |
| `session_id_hash` | `text` | 006 | Tersedia (SHA-256 access token) |
| `token_hash` | `text` | 006 | Tersedia (SHA-256 access token) |
| `expires_at` | `timestamptz` | 006 | Tersedia |
| `last_activity_at` | `timestamptz` | 006 | Tersedia |
| `session_version` | `integer` | 008, 009 | **Ditambahkan via Migrasi 008 & 009** |
| `revoked_at` | `timestamptz` | 006 | Tersedia |
| `ip_address` | `text` | 006 | Tersedia |
| `user_agent` | `text` | 006 | Tersedia |
| `device_type` | `text` | 006 | Tersedia |

### 3.3. Tabel `public.refresh_tokens`

| Kolom | Tipe Data | Di Migrasi Mana Dibuat? | Status Ketersediaan |
|---|---|---|---|
| `id` | `text` PK | 006 | Tersedia |
| `user_id` | `text` FK users | 006 | Tersedia |
| `session_id` | `text` FK auth_sessions | 006 | Tersedia |
| `token_hash` | `text` UNIQUE | 006 | Tersedia (SHA-256 refresh token) |
| `session_version` | `integer` | 008, 009 | **Ditambahkan via Migrasi 008 & 009** |
| `expires_at` | `timestamptz` | 006 | Tersedia |
| `revoked_at` | `timestamptz` | 006 | Tersedia |
| `replaced_by_token_hash`| `text` | 006 | Tersedia (Anti-replay chaining) |

---

## 4. Perbedaan Skema dengan Kueri Backend & Adaptasi Defensif

1. **Kolom `session_version` pada `auth_sessions` dan `refresh_tokens`:**
   - *Masalah Potensial:* Jika database live baru menjalankan migrasi `001` hingga `006`, kolom `session_version` belum hadir secara fisik di tabel `auth_sessions` dan `refresh_tokens`.
   - *Solusi Defensif di Backend:* Kode pada `server/customAuthService.ts` telah dilengkapi penanganan error dinamis (`PGRST204` / `42703`). Jika PostgreSQL mengembalikan error kolom belum ada, backend secara transparan melakukan retry tanpa kolom tersebut, sembari tetap menjaga integritas `session_version` di level access token string (`mora_at_v{v}_...`) dan tabel `public.users`.
2. **Ketersediaan Stored Functions PL/pgSQL:**
   - Migrasi `009` memperkenalkan fungsi `fn_create_auth_session_atomic`, `fn_rotate_refresh_token_atomic`, dan `fn_revoke_all_user_sessions_atomic`.
   - Kode backend mencoba memanggil RPC ini terlebih dahulu; jika belum diterapkan di database (`PGRST202`), backend mengeksekusi *sequential atomic compensation rollback* berbasis query PostgREST standar yang 100% kompatibel dengan skema saat ini.

---

## 5. Kepatuhan Keselamatan Migrasi

1. **Nihil Penghapusan:** Tidak ada satu pun file migrasi lama yang dihapus dari repositori.
2. **Nihil Mutasi Database Produksi:** Database produksi tidak dimutasi atau dijalankan DDL selama tahap perbaikan kode ini.
3. **Nihil Migrasi Otomatis Saat Startup:** Server Express dilarang keras menjalankan DDL atau DML migrasi secara otomatis saat booting.
4. **Non-Destruktif:** Migrasi baru `009` murni menggunakan konstruksi `IF NOT EXISTS` dan `CREATE OR REPLACE FUNCTION` tanpa operasi `DROP`, `TRUNCATE`, atau penghapusan data.
