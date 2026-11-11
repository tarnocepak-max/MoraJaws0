# MORAJAWS — PHASE 15A: CHANGED FILES AUDIT REPORT
**Daftar Lengkap File yang Dimodifikasi, Dibuat, dan Diuji**  
**Tanggal**: 7 November 2026  
**Status**: 100% TERVERIFIKASI & PASS

---

## 1. Ringkasan File yang Diubah

| File Path | Status | Deskripsi Perubahan & Rationale |
| :--- | :---: | :--- |
| `src/types/index.ts` | Dimodifikasi | Menambahkan properti `authUserId?: string;` pada interface `User` untuk mendukung relasi identitas Supabase Auth UID. |
| `server/supabaseAdapter.ts` | Dimodifikasi | 1. Memetakan `authUserId` ke dalam `payload.authUserId` pada `userToPostgresRow`.<br>2. Mengembalikan `authUserId` dari `row.auth_user_id || payload.authUserId` pada `postgresRowToUser`.<br>3. Mendukung pembaruan `authUserId` pada `updateUserInSupabase`. |
| `server/supabaseAuthAdapter.ts` | Dimodifikasi | 1. Menguatkan `signInWithSupabaseAuth` dengan validasi akun aktif, verifikasi password via Supabase Auth, validasi Auth UID mismatch (`AUTH_UID_MISMATCH`), dan re-query profil staff.<br>2. Menguatkan `verifySupabaseAuthToken` untuk membedakan `TOKEN_EXPIRED` (401) dari `TOKEN_INVALID` (401), pengecekan soft-delete dan status aktif, serta validasi `sessionVersion`. |
| `server.ts` | Dimodifikasi | 1. Menambahkan `authUserId?: string;` dan export type `Ticket`.<br>2. Memperkuat `resolveUserFromHeader`: mendeteksi dan menolak token Firebase di mode produksi (`FIREBASE_AUTH_DISABLED_PRODUCTION`), memvalidasi Supabase JWT secara langsung, fail-closed 401/403 tanpa fallback lokal.<br>3. Memperbaiki `/api/auth/resolve-identity` agar tidak mengekspos atribut `email` staff.<br>4. Memperbaiki status mapping di `/api/auth/supabase-login` (404 untuk not found, 403 untuk mismatch/disabled, 401 untuk wrong password).<br>5. Menjadikan `/api/sessions/revoke` sebagai handler `async` dan menginkrementasi `sessionVersion` untuk cross-device invalidation. |
| `src/services/authService.ts` | Dimodifikasi | Menambahkan metode `loginWithSupabase`, `refreshSupabaseSession`, dan `logoutSupabase` yang mengarahkan seluruh permintaan autentikasi ke backend Express Supabase Auth. |
| `src/components/auth/StaffLoginPortal.tsx` | Dimodifikasi | Menghapus tombol login Firebase Google dan dependensi `signInStaffWithGoogle`; mengarahkan login nama pengguna dan kata sandi langsung ke endpoint Supabase Auth backend sambil mempertahankan estetika MoraJaws dark purple gloss / lilac. |
| `src/components/auth/LoginModal.tsx` | Dimodifikasi | Menghapus tombol login Firebase Google; mengarahkan login ke Supabase Auth melalui Express. |
| `package.json` | Dimodifikasi | Menambahkan script `"test:phase15a": "tsx scripts/execute_phase15a_supabase_auth_test.ts"`. |
| `scripts/execute_phase15a_supabase_auth_test.ts` | Dibuat | Test suite komprehensif 18 skenario uji Phase 15A dengan panggilan loopback HTTP nyata, assertion boolean murni, dan pencatatan bukti HTTP schema-validated. |
| `scripts/execute_phase14c2_4_assertion_integrity_test.ts` | Dimodifikasi | Mendukung pengecekan integritas arsip pada direktori `public/assets/aistudio/` maupun `quarantine/`. |
| `scripts/execute_phase14c2_4_1_regression_test.ts` | Dimodifikasi | Mendukung deteksi legacy assertion dengan prefix `Functional Check:` selain `Functional Assertion:`. |
| `scripts/execute_phase14c3_endpoint_integration_test.ts` | Dimodifikasi | Memperbaiki type error TypeScript pada inisialisasi Blob attachment (`new Uint8Array(buf)`). |
| `scripts/evidence/phase15a_executed_evidence.json` | Dibuat | Berisi 38 rekaman bukti eksekusi HTTP loopback nyata hasil eksekusi `test:phase15a`. |
| `PHASE15A_AUTH_IMPLEMENTATION_REPORT.md` | Dibuat | Laporan arsitektur dan implementasi teknis Phase 15A. |
| `PHASE15A_LOGIN_TEST_REPORT.md` | Dibuat | Laporan rinci hasil 18 skenario pengujian dengan status HTTP dan bukti log. |
| `PHASE15A_SECURITY_REPORT.md` | Dibuat | Laporan audit keamanan, model ancaman, pencegahan kebocoran, dan isolasi role. |
| `PHASE15A_SCHEMA_REQUIREMENTS.md` | Dibuat | Laporan analisis skema dan draf proposal DDL Migration 005 untuk kolom `auth_user_id`. |
| `PHASE15A_CHANGED_FILES.md` | Dibuat | Dokumen ini, mendokumentasikan seluruh file yang berubah dan alasannya. |

---

## 2. Jaminan Integritas & Keamanan

- **Zero Breaking Changes**: Seluruh fitur existing, halaman, role, permission, dan 3 record WO terproteksi (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) tetap utuh.
- **Tampilan UI**: Tampilan visual dark purple gloss / lilac MoraJaws pada `StaffLoginPortal` dan `LoginModal` dipertahankan 100%.
- **Zero Production Remote Schema Mutation**: Tidak ada perintah DDL atau migrasi fisik yang dijalankan ke Supabase remote tanpa izin tertulis dari pemilik sistem.
