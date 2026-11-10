# MORAJAWS — LAPORAN RESMI PHASE 16A.2.1
## MIGRATION 007 SAFETY CORRECTION & STAGING EXECUTION READINESS

**Tanggal Audit & Koreksi**: 9 November 2026  
**Target Staging Project ID**: `lvytgqsvxntnvlohmrxi` (MoraJaws-Staging-Auth)  
**Target Staging Supabase URL**: `https://lvytgqsvxntnvlohmrxi.supabase.co`  
**Prinsip Arsitektur**: Express Backend sebagai satu-satunya access layer ke database Supabase PostgreSQL.

---

### 1. TEMUAN DAN KOREKSI (SECTION A & B & C & D & E)

| No | Temuan Asli (Phase 16A.2) | Akar Masalah | Tindakan Koreksi (Phase 16A.2.1) |
|---|---|---|---|
| **1** | `migrations/007_phase16a2_staging_account_alignment_reference.sql` memiliki UPDATE yang dapat menimpa `auth_user_id` yang sudah terisi dan dapat memperbarui > 1 profil. | Klausa `WHERE (auth_user_id IS NULL OR auth_user_id <> '...')` menimpa UID yang sudah ada, dan tanpa pemeriksaan jumlah kecocokan dapat mengubah banyak profil sekaligus. | **Direvisi total**: Menambahkan SELECT audit awal, penghitungan jumlah kecocokan profil (`COUNT(*)`), deteksi `NOT FOUND` (0 profil), deteksi `AMBIGUOUS` (>1 profil), deteksi `CONFLICT` (jika UID sudah terisi atau UID target sudah terpakai profil lain), larangan membuat akun staf palsu, larangan mengubah role/contractor/area, serta penambahan **Gerbang Persetujuan Pemilik (Owner Confirmation Gate)** dan verifikasi transaksi `ROW_COUNT = 1`. |
| **2** | Migration 007 menggunakan `CREATE TABLE IF NOT EXISTS`, tetapi belum menjamin kompatibilitas kolom dan constraint pada tabel lama. | Pada PostgreSQL, jika tabel sudah ada dari migrasi lama (001–006), perintah `CREATE TABLE IF NOT EXISTS` tidak melakukan apa pun sehingga kolom baru tidak terbuat. | **Direvisi & Ditambahkan**: Ditambahkan Bagian `16.B. IDEMPOTENT SCHEMA RECONCILIATION & COLUMN COMPATIBILITY` pada Migration 007 dengan klausa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` untuk seluruh kolom penting (seperti `installer_id`, `work_sessions`, `auth_user_id`, `session_version`, dll.), serta dibuat script preflight read-only `migrations/007_phase16a2_1_preflight_schema_audit.sql`. |
| **3** | Migration 007 memberikan `GRANT SELECT` kepada role `authenticated`. | Menyalahi arsitektur MoraJaws: browser tidak boleh mengakses Supabase PostgreSQL secara langsung; akses direct bypass middleware Express, rate limiting, dan audit trail. | **Direvisi**: Diterapkan `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;`, dicabut seluruh policy direct client untuk authenticated, dan akses penuh hanya diberikan kepada `service_role` yang dipakai backend Express. RLS tetap diaktifkan (deny-by-default). |
| **4** | Rollback 007 tidak boleh dianggap sebagai pemulihan penuh karena hanya menghapus sebagian policy, trigger, function, dan index. | Menghapus tabel atau kolom baru akan menghancurkan data operasional (destruktif), sedangkan menghapus trigger proteksi 3 WO legasi merusak integritas aturan proyek. | **Direvisi**: `migrations/007_phase16a2_rollback_plan.sql` didokumentasikan secara transparan memisahkan objek yang dapat dipulihkan secara aman vs objek yang tidak dapat dipulihkan otomatis, analisis risiko pencabutan trigger, pohon dependensi, langkah pemulihan manual, dan gerbang pengaman eksekusi rollback. |
| **5** | Test Phase 16A.2 menggunakan mock; hasilnya tidak boleh disebut sebagai bukti live staging. | Pencampuran hasil pengujian mock dengan status lingkungan nyata dapat menyesatkan. | **Dipisahkan secara tegas**: Seluruh laporan dan test suite (`scripts/execute_phase16a2_1_safety_and_alignment_test.ts`) membagi hasil ke dalam 3 kategori terpisah: `[MOCK TEST]`, `[STATIC SQL AUDIT]`, dan `[LIVE STAGING TEST]` (berstatus `BLOCKED` / `NOT TESTED` tanpa kredensial staging runtime). |

---

### 2. DAFTAR FILE BERUBAH DAN DITAMBAHKAN

1. **`migrations/007_phase16a2_staging_account_alignment_reference.sql`** *(Direvisi)*:
   - Menghapus klausa UPDATE berbahaya yang dapat menimpa UID.
   - Menerapkan pemeriksaan diagnostik bertahap: `NOT FOUND`, `AMBIGUOUS`, `CONFLICT_UID_IN_USE`, `CONFLICT_DIFFERENT_UID`.
   - Menjamin nol mutasi pada role, nama, username, kontraktor, atau area.
   - Menambahkan default dry-run (`v_owner_confirmed = false`).
2. **`migrations/007_phase16a2_staging_schema_initialization.sql`** *(Direvisi)*:
   - Mencabut seluruh izin direct client: `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;`.
   - Menghapus direct-client RLS policies untuk `authenticated`.
   - Mempertahankan hak akses penuh strictly untuk `service_role`.
   - Menambahkan blok rekonsiliasi kolom `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` untuk menjamin kompatibilitas tabel lama.
3. **`migrations/007_phase16a2_rollback_plan.sql`** *(Direvisi)*:
   - Dokumentasi eksplisit objek yang dapat dipulihkan vs yang tidak dapat dipulihkan otomatis.
   - Peringatan risiko pencabutan trigger proteksi 3 WO legasi soft-deleted.
   - Hirarki ketergantungan objek dan checklist pemulihan manual bagi DBA.
   - Gerbang persetujuan pemilik (`v_owner_confirmed := false`).
4. **`migrations/007_phase16a2_1_preflight_schema_audit.sql`** *(Baru)*:
   - Script SQL murni read-only untuk mengaudit seluruh 19 tabel, kolom, constraint, indeks, trigger, RLS, policy, dan grant.
5. **`scripts/execute_phase16a2_1_safety_and_alignment_test.ts`** *(Baru)*:
   - Test suite ekstensif mencakup seluruh 12 skenario wajib, memisahkan Mock Test, Static SQL Audit, dan Live Staging Test.
6. **`scripts/audit_preflight_19_tables.ts`** *(Baru)*:
   - Tool preflight Node.js/TypeScript untuk memvalidasi skema 19 tabel baik secara statis maupun remote live.
7. **`scripts/execute_phase16a2_schema_and_auth_alignment_test.ts`** *(Diperbarui)*:
   - Menyesuaikan asersi Test 9 agar memvalidasi arsitektur Express-only (`REVOKE ALL FROM authenticated, anon`).
8. **`package.json`** *(Diperbarui)*:
   - Menambahkan script `"test:phase16a.2.1"` dan `"audit:preflight"`.

---

### 3. HASIL PREFLIGHT 19 TABEL (STATIC AUDIT)

Preflight read-only memvalidasi kesiapan definisi DDL untuk seluruh 19 tabel kanonikal:
- `roles`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `contractors`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `coverage_areas`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `users`: DDL [PASS], RLS [PASS], Kolom Kritis (`auth_user_id`, `session_version`, `alt_email`, `firebase_uid`, `role`, `is_deleted`) [PASS]
- `work_orders`: DDL [PASS], RLS [PASS], Kolom Kritis (`installer_id`, `appointment_date`, `work_sessions`, `chat_messages_count`, `status_wo_agent`, `is_deleted`) [PASS]
- `assignment_history`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `ticket_messages`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `technical_reports`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `wa_templates`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `app_settings`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `user_preferences`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `session_config`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `user_sessions`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `attachments`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `audit_logs`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `integration_configs`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `sync_history`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `system_error_logs`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]
- `report_categories`: DDL [PASS], RLS [PASS], Kolom Kritis [PASS]

---

### 4. HASIL AUDIT GRANT DAN RLS

- **Role `anon`**: `REVOKE ALL ON ALL TABLES, SEQUENCES, ROUTINES IN SCHEMA public` -> **PASS (Zero Access)**.
- **Role `authenticated`**: `REVOKE ALL ON ALL TABLES, SEQUENCES, ROUTINES IN SCHEMA public` -> **PASS (Zero Direct Access)**.
- **Role `service_role`**: `GRANT ALL ON ALL TABLES, SEQUENCES, ROUTINES IN SCHEMA public` -> **PASS (Authorized Express Backend Only)**.
- **Row Level Security**: Aktif di seluruh 19 tabel (`rowsecurity = true`) -> **PASS (Deny-by-default)**.
- **Proteksi 3 WO Legasi**: Trigger `trg_protect_legacy_wo_mutation` dan fungsi `fn_protect_legacy_soft_deleted_wo` dipertahankan mutlak -> **PASS**.
- **Immutabilitas Audit Logs**: Trigger `trg_audit_logs_immutable` melarang `UPDATE` dan `DELETE` -> **PASS**.

---

### 5. HASIL TEST PENGUJIAN FASE 16A.2.1

| No | Kategori | Skenario Pengujian | Status | Rincian Bukti |
|---|---|---|---|---|
| 1 | MOCK TEST | Tidak ada profil staf cocok | **PASS** | Mengembalikan `NOT_FOUND`, 0 baris ter-update, tidak membuat profil palsu. |
| 2 | MOCK TEST | Satu profil cocok dan UID NULL | **PASS** | `DRY_RUN_PASSED` menahan update; eksekusi terkonfirmasi mengaitkan tepat 1 baris ke Auth UID. |
| 3 | MOCK TEST | Dua profil memiliki email cocok | **PASS** | Mengembalikan `AMBIGUOUS`, 0 baris ter-update, mencegah salah sasaran pengaitan. |
| 4 | MOCK TEST | Profil memiliki UID berbeda | **PASS** | Mengembalikan `CONFLICT`, 0 baris ter-update, menolak menimpa UID yang sudah terisi. |
| 5 | MOCK TEST | UID sudah digunakan profil lain | **PASS** | Mengembalikan `CONFLICT_UID_IN_USE`, 0 baris ter-update, mencegah duplikasi 1:1 UID. |
| 6 | MOCK TEST | Script tidak mengubah role | **PASS** | Role profil kandidat tetap utuh ('leader'), script SQL bebas klausa `role =`. |
| 7 | STATIC SQL AUDIT | Script tidak membuat akun Auth | **PASS** | Nol perintah `INSERT INTO auth.users` pada seluruh file SQL. |
| 8 | STATIC SQL AUDIT | Script tidak mengubah password | **PASS** | Nol perintah mutasi kata sandi / password_hash pada seluruh file SQL. |
| 9 | STATIC SQL AUDIT | Browser tidak mendapat akses database langsung | **PASS** | Tidak ada `GRANT TO authenticated`; ada `REVOKE ALL FROM authenticated, anon`. |
| 10 | STATIC SQL AUDIT | RLS tetap aktif di 19 tabel | **PASS** | 19/19 tabel memiliki deklarasi `ENABLE ROW LEVEL SECURITY`. |
| 11 | MOCK & STATIC | Migration mendeteksi tabel lama berbeda struktur | **PASS** | Preflight query tersedia dan Migration 007 memiliki `ADD COLUMN IF NOT EXISTS`. |
| 12 | STATIC SQL AUDIT | Rollback tidak menghapus data | **PASS** | Nol `DROP TABLE`, `TRUNCATE`, `DELETE FROM`, atau `DROP COLUMN` pada script rollback. |
| 13 | LIVE STAGING TEST | Eksekusi remote langsung ke staging `lvytgqsvxntnvlohmrxi` | **BLOCKED** | Kredensial service-role staging belum dimasukkan di runner; eksekusi remote ditahan menunggu persetujuan eksplisit pemilik. |

---

### 6. HASIL LINT DAN BUILD

- **TypeScript Compilation Check (`compile_applet`)**: **PASS** (Exit code 0).
- **TypeScript Strict Linter (`lint_applet` / `npm run lint`)**: **PASS** (Exit code 0, 0 error).
- **Vite Production Build (`npm run build`)**: **PASS** (Exit code 0, dist bundle 3,921 kB).
- **Phase 16A.2 Regression Test (`npm run test:phase16a.2`)**: **PASS** (14/14 scenarios passed).
- **Phase 16A.2.1 Test Suite (`npm run test:phase16a.2.1`)**: **PASS** (12/12 Mock & Static passed, 1 Live Staging safely Blocked).

---

### 7. RISIKO TERSISA & BATASAN

1. **Eksekusi Remote Staging Menunggu Persetujuan**:
   - DDL skema 007 dan script pengaitan akun belum diterapkan pada project staging `lvytgqsvxntnvlohmrxi`.
   - Sesuai instruksi keselamatan, eksekusi DDL remote dan pengaitan akun membutuhkan persetujuan manual eksplisit dari pemilik aplikasi.
2. **Ketiadaan Kredensial Staging di Test Runner**:
   - Environment test saat ini tidak memiliki `SUPABASE_SERVICE_ROLE_KEY` staging, sehingga seluruh pengujian live remote berstatus `BLOCKED` demi keamanan.

---

### 8. PANDUAN PENERAPAN MANUAL YANG AMAN BAGI PEMILIK APLIKASI

Jika pemilik aplikasi menyetujui penerapan migrasi ke database Staging (`lvytgqsvxntnvlohmrxi`):

1. **Langkah 1 (Audit Pra-Migrasi)**:
   Buka Supabase SQL Editor pada project `lvytgqsvxntnvlohmrxi`. Jalankan file `migrations/007_phase16a2_1_preflight_schema_audit.sql` (100% read-only). Pastikan koneksi dan status skema saat ini terpantau.
2. **Langkah 2 (Penerapan Skema Inisialisasi)**:
   Jalankan file `migrations/007_phase16a2_staging_schema_initialization.sql`. Script ini secara aman membuat 19 tabel, mengaktifkan RLS, menerapkan proteksi 3 WO legasi, mencabut akses langsung anon/authenticated, dan memberikan akses penuh strictly ke `service_role`.
3. **Langkah 3 (Pemeriksaan Akun Staf)**:
   Jalankan Bagian 1 dari `migrations/007_phase16a2_staging_account_alignment_reference.sql` (read-only). Periksa apakah akun `rayhanafirzanx@gmail.com` telah terdaftar di `auth.users` dan apakah profil staf yang sesuai ditemukan di `public.users`.
4. **Langkah 4 (Pengaitan Akun Staf)**:
   Jalankan Bagian 2 (DO block) dengan `v_owner_confirmed := false` terlebih dahulu untuk melihat hasil simulasi (`DRY_RUN_SUCCESS`). Setelah yakin profil yang cocok adalah tepat 1 baris, ubah menjadi `v_owner_confirmed := true` lalu jalankan untuk menyelesaikan pengaitan.
5. **Langkah 5 (Verifikasi Pasca-Pengaitan)**:
   Jalankan Bagian 3 untuk memastikan relasi 1:1 antara `public.users.auth_user_id` dan `auth.users.id`.
