# MORAJAWS0 — PHASE 15A.1 CHANGED FILES MANIFEST
**Document ID**: MORAJAWS-DIFF-PHASE15A1-005  
**Phase**: Phase 15A.1 — Auth Session Hardening & Identity Mapping Integrity  
**Scope**: Targeted Code Modifications & Verifications (Zero Destructive Overwrites)  
**Date**: November 2026  

---

## 1. Summary of Changes

Phase 15A.1 melakukan modifikasi terarah pada 3 file kode existing, menambahkan 1 skrip migrasi draft SQL, menambahkan 1 modul test runner lengkap dengan bukti evidence JSON, serta menyusun 6 laporan dokumentasi resmi.

---

## 2. Modified & Created Files Inventory

### 2.1 Backend Core Files

#### 1. `server.ts` (Modified)
- **Perubahan & Rasional**:
  - **Hardened `resolveUserFromHeader()`**: Menolak token format sesi lokal (`LOCAL_AUTH_DISABLED_PRODUCTION`) dan Firebase token (`FIREBASE_AUTH_DISABLED_PRODUCTION`) saat mode produksi aktif (`!isLocalJsonModeAllowed()`). Memastikan kegagalan koneksi database Supabase merespons dengan HTTP 503 `DATABASE_UNAVAILABLE` (fail-closed, tanpa fallback ke JSON).
  - **Added `validateCsrfProtection()`**: Memvalidasi origin/host request state-mutating serta keberadaan header kustom (`Authorization`, `X-Requested-With`, `Content-Type`).
  - **Added `POST /api/auth/approve-mapping`**: Endpoint khusus Super Admin (`requireSuperAdmin`) untuk memanggil fungsi `approveAuthUidMapping()` dengan validasi UUID dan verifikasi baca ulang database.
  - **Hardened `POST /api/auth/supabase-logout`**: Membaca user dari Supabase, menaikkan `sessionVersion`, meng-await update tanpa menelan exception (`catch {}`), memverifikasi hasil update dengan read-back, membersihkan in-memory cache sesi `SERVER_SESSIONS`, dan memanggil `signOutSupabaseAuth()`.
  - **Hardened `POST /api/sessions/revoke`**: Meng-await update `sessionVersion` ke database Supabase, melakukan read-back verification, dan membersihkan cache in-memory.
  - **Hardened `POST /api/users`**: Pada mode produksi, atribut `passwordHash` disetel string kosong `''` dan tidak lagi menyuntikkan `DEFAULT_HASH` ('12345678').
  - **Hardened `POST /api/users/:id/reset-password`**: Menolak penyuntikan hash default '12345678' pada mode produksi, menaikkan `sessionVersion`, dan memicu alur password recovery Supabase Auth.
  - **Hardened `POST /api/auth/change-password`**: Menolak pergantian password lokal pada mode produksi dengan HTTP 400 `LOCAL_PASSWORD_DISABLED`.

#### 2. `server/supabaseAuthAdapter.ts` (Modified)
- **Perubahan & Rasional**:
  - **Eliminated Auto-Linking in `signInWithSupabaseAuth()`**: Menghapus penautan otomatis `profile.authUserId = authUser.id`. Akun staf tanpa mapping mengembalikan HTTP 403 `NEEDS_MAPPING`. Token dengan Auth UID yang tidak cocok mengembalikan HTTP 403 `AUTH_UID_MISMATCH`.
  - **Added `approveAuthUidMapping()`**: Fungsi terverifikasi untuk mengikat `auth.users.id` ke `public.users.id`. Memvalidasi UUID, memastikan invarian 1:1, melakukan write ke database, memverifikasi hasil simpan dengan read-back, dan mempertahankan keaslian `profile.id`.
  - **Hardened `verifySupabaseAuthToken()`**: Memvalidasi bahwa profil staf memiliki `authUserId` yang cocok dan berstatus `isActive === true`. Akun tanpa mapping mengembalikan error `NEEDS_MAPPING`.
  - **Hardened `refreshSupabaseAuthSession()`**: Memverifikasi bahwa profil staf yang disegarkan tetap aktif dan belum dihapus di database otoritatif.

#### 3. `package.json` (Modified)
- **Perubahan & Rasional**:
  - Menambahkan script pengujian baru: `"test:phase15a.1": "tsx scripts/execute_phase15a1_session_hardening_test.ts"`.

---

### 2.2 Database & Migration Files

#### 4. `migrations/005_add_auth_user_id_to_users.sql` (Created / Draft Proposal)
- **Perubahan & Rasional**:
  - Rancangan DRAFT SQL aman yang menambahkan kolom `auth_user_id UUID` dengan foreign key ke `auth.users(id) ON DELETE SET NULL`.
  - Menambahkan Unique Partial Index `idx_users_auth_user_id_unique` untuk menjamin hubungan 1:1 tanpa mengorbankan akun staf yang belum dipetakan.
  - Mengimplementasikan helper function `public.get_auth_user_role(p_auth_uid UUID)` bertanda `SECURITY DEFINER` dan `SET search_path = public, pg_temp` untuk mengeliminasi bahaya Recursive RLS Policy (SQLSTATE 42P17).
  - Merumuskan template backfill idempoten yang aman.
  - Menegaskan status DRAFT ONLY (tidak dijalankan ke database remote).

---

### 2.3 Test Suite & Evidence Artifacts

#### 5. `scripts/execute_phase15a1_session_hardening_test.ts` (Created)
- **Perubahan & Rasional**:
  - Test runner mandiri yang menguji 17 skenario wajib menggunakan instans Express terisolasi (`createExpressApp({ skipVite: true })`) dan mock Supabase client terstandarisasi.
  - Menghasilkan bukti pengujian nyata tanpa fake PASS.

#### 6. `scripts/evidence/phase15a1_executed_evidence.json` (Created)
- **Perubahan & Rasional**:
  - Berkas log audit terstruktur yang menyimpan timestamp, kode status HTTP, payload respon, dan hasil verifikasi state untuk ke-17 skenario.

---

### 2.4 Documentation & Audit Reports

#### 7. `PHASE15A1_IMPLEMENTATION_REPORT.md` (Created)
- Laporan komprehensif implementasi Phase 15A.1 sesuai 10 ketentuan output MORAJAWS.

#### 8. `PHASE15A1_SECURITY_REPORT.md` (Created)
- Laporan audit keamanan, matriks remedi ancaman, analisis token storage, kendala cookie iframe, dan evaluasi CSRF.

#### 9. `PHASE15A1_SESSION_TEST_REPORT.md` (Created)
- Laporan eksekusi pengujian 17 skenario sesi dengan rincian asersi fungsional dan status kelulusan 100%.

#### 10. `PHASE15A1_IDENTITY_MAPPING_REPORT.md` (Created)
- Laporan arsitektur integritas pemetaan identitas, alasan penghapusan auto-linking, preservasi `profile.id`, dan protokol `approveAuthUidMapping`.

#### 11. `PHASE15A1_SCHEMA_RLS_REVIEW.md` (Created)
- Laporan tinjauan arsitektur Migration 005, eliminasi RLS rekursif via `SECURITY DEFINER`, dan pemisahan hak akses service-role.

#### 12. `PHASE15A1_CHANGED_FILES.md` (Created)
- Berkas manifes ini yang mencatat seluruh perubahan dan penambahan file pada Phase 15A.1.
