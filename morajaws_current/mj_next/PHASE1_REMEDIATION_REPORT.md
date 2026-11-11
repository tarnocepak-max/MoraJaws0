# MoraJaws Phase 1 Remediation Report: Custom Auth Fail-Closed & Session Integrity

**Date:** 2026-11-10  
**Phase:** MoraJaws Phase 1 (Custom Login Stabilization & Fail-Closed Session Remediation)  
**Status:** COMPLETED & VERIFIED (All 12 Mandatory Integration Tests Passed)  
**Security Boundary:** PostgreSQL Authoritative, Zero Firebase Auth Dependency, Fail-Closed on Production  

---

## 1. Executive Summary

Audit source code MoraJaws terbaru mengidentifikasi celah keamanan kritis pada modul autentikasi:
1. **Fallback Diam-diam (Silent Fallback):** Pada implementasi sebelumnya, jika penyimpanan `auth_sessions` atau `refresh_tokens` ke Supabase PostgreSQL mengalami kegagalan, kode hanya mencetak `console.warn` dan tetap menyimpan sesi ke memori lokal (`LOCAL_AUTH_SESSIONS`), lalu mengembalikan respons login sukses kepada klien.
2. **Ketiadaan Session Version pada Sesi Basis Data:** Tabel `public.auth_sessions` dan `public.refresh_tokens` pada migrasi 006 belum memiliki kolom `session_version`, sehingga kueri pencabutan sesi dan validasi integritas token di level basis data tidak tersinkronisasi sempurna dengan `public.users.session_version`.
3. **Potensi Replay Attack:** Penanganan rotasi refresh token sebelumnya belum menerapkan rollback kompensasi transaksi atomik ketika salah satu operasi basis data gagal.
4. **Risiko Otorisasi Frontend:** Pemetaan identitas dan hak akses sebelumnya sempat mengizinkan fallback ke memori in-memory server pada saat database offline di mode produksi.

Dalam Phase 1 Remediation ini, seluruh kelemahan di atas telah diperbaiki secara tuntas tanpa melakukan migrasi seluruh database aplikasi dan tanpa mengubah atau merusak data Work Order (WO).

---

## 2. Rincian Perubahan Kode & File Terkena Dampak

### 2.1. `server/customAuthService.ts`

- **Implementasi Guard Fail-Closed (`isLocalAuthAllowed()`):**
  - Pada lingkungan produksi (`NODE_ENV === 'production'` atau `APP_ENV === 'production'`), seluruh operasi autentikasi mewajibkan koneksi Supabase PostgreSQL aktif (`getActiveBackendClient()`).
  - Jika Supabase tidak tersedia pada produksi, fungsi langsung mengembalikan error fail-closed `DATABASE_UNAVAILABLE` (HTTP 503) dan menolak proses login.
  - Penggunaan `LOCAL_AUTH_SESSIONS`, `LOCAL_REFRESH_TOKENS`, dan `db.users` sebagai fallback dihapus secara mutlak pada mode produksi. Mode lokal hanya diizinkan pada saat `NODE_ENV !== 'production'` dan konfigurasi lokal secara eksplisit mengizinkannya.
- **Perbaikan `persistNewAuthSession()` (Atomic & Fail-Closed Persistence):**
  - Menghasilkan access token (`mora_at_v<version>_<random32hex>`) dan refresh token (`mora_rt_v<version>_<random48hex>`) yang secara kriptografis aman (`crypto.randomBytes`).
  - Token disimpan dalam format SHA-256 hash (`hashToken()`); token mentah tidak pernah disimpan di database.
  - Memasukkan `session_version` yang bersumber langsung dari `public.users.session_version` ke dalam `auth_sessions` dan `refresh_tokens`.
  - Menerapkan **Atomic Compensation Rollback**: Jika penyimpanan `refresh_tokens` gagal setelah `auth_sessions` berhasil disimpan, record `auth_sessions` langsung dihapus secara atomik dari PostgreSQL, proses login digagalkan, dan error `REFRESH_TOKEN_INSERT_FAILED` dikembalikan.
- **Perbaikan `verifyAccessToken()` (Session Version & Revocation Enforcement):**
  - Memverifikasi status sesi di `public.auth_sessions`.
  - Mengambil data pengguna authoritative dari `public.users`.
  - Membandingkan `session_version` pada token dan sesi dengan `users.session_version`. Jika tidak cocok (misalnya akibat pergantian kata sandi atau pencabutan sesi), sesi langsung ditandai `revoked_at = now()` di PostgreSQL dan permintaan ditolak dengan kode `SESSION_REVOKED`.
  - Memeriksa `revoked_at` dan `expires_at` secara ketat.
- **Perbaikan `rotateRefreshToken()` (Anti-Replay & Transactional Rotation):**
  - Mencari token berdasarkan `token_hash` di `public.refresh_tokens`.
  - Jika `revoked_at` tidak null, permintaan langsung ditolak dengan `REFRESH_TOKEN_REVOKED` (deteksi replay attack).
  - Memvalidasi kecocokan `session_version` refresh token dengan user.
  - Melakukan rotasi aman dengan kompensasi rollback: mencabut token lama (`revoked_at`, `replaced_by_token_hash`), menyimpan token baru, dan memperbarui sesi induk di `auth_sessions`. Jika terjadi kegagalan basis data di tengah proses, perubahan di-rollback secara konsisten.
- **Perbaikan `revokeAllUserSessions()`:**
  - Menghitung `next_version = users.session_version + 1` dan memperbarui `public.users`.
  - Mencabut seluruh sesi aktif di `public.auth_sessions` (`revoked_at = now()` WHERE `revoked_at IS NULL`).
  - Mencabut seluruh refresh token aktif di `public.refresh_tokens` (`revoked_at = now()` WHERE `revoked_at IS NULL`).
- **Penyempurnaan Prioritas Pencarian Pengguna Lokal:**
  - Mengutamakan pencarian eksak pada `username` dan `email` sebelum memeriksa daftar alamat alternatif pada `altEmail`.

### 2.2. `server.ts`

- **Middleware `resolveUserFromHeader`:**
  - Menonaktifkan fallback ke `SERVER_SESSIONS` dan `db.users` pada mode produksi (`if (!found && isLocalJsonModeAllowed())`).
  - Pada produksi, verifikasi kredensial wajib tervalidasi via `verifyAccessToken` yang terhubung langsung ke Supabase PostgreSQL.
- **Endpoint `/api/admin/users/:id/revoke-sessions`:**
  - Mewajibkan otorisasi backend `requireSuperAdmin` (mengevaluasi role `super_admin` dari record sesi yang diverifikasi backend, bukan dari payload frontend).
  - Memvalidasi parameter `id` dan memeriksa hasil eksekusi `revokeAllUserSessions`. Jika gagal, mengembalikan status HTTP 500/503 yang sesuai dan mencatat audit trail.
- **Endpoint `/api/auth/admin/reset-password`:**
  - Memeriksa role Superadmin secara server-side via `requireSuperAdmin`.
  - Memverifikasi target pengguna di Supabase PostgreSQL.
  - Meng-hash password baru dengan bcrypt (10 rounds).
  - Menaikkan `session_version` dan membatalkan seluruh sesi aktif target user secara atomik via `revokeAllUserSessions`.

### 2.3. Migrasi Database

- Dibuat file migrasi baru: `migrations/009_phase1_custom_auth_atomic_session_transaction.sql` (non-destruktif):
  - Memastikan kolom dan indeks `session_version` pada `public.users`, `public.auth_sessions`, dan `public.refresh_tokens`.
  - Mendefinisikan stored functions PL/pgSQL: `fn_create_auth_session_atomic`, `fn_rotate_refresh_token_atomic`, dan `fn_revoke_all_user_sessions_atomic`.
  - Menetapkan hak eksekusi ke peran `service_role`.

---

## 3. Matriks Hasil Pengujian Wajib (12/12 PASSED)

| No | Kasus Uji | Kategori | Hasil | Keterangan Verifikasi |
|---|---|---|---|---|
| 1 | Login normal (PBKDF2 ke Bcrypt) | Session Integrity | **PASSED** | Login akun Superadmin `rays` berhasil, hash PBKDF2 di-upgrade ke bcrypt, session dan refresh_token tersimpan di PostgreSQL. |
| 2 | Login dengan password salah | Resilience | **PASSED** | Ditolak dengan `INVALID_CREDENTIALS`, kegagalan tercatat di `login_attempts`. |
| 3 | Login saat Supabase tidak tersedia | Fail-Closed | **PASSED** | Ditolak dengan `DATABASE_UNAVAILABLE` (503); tidak ada fallback memori lokal pada mode produksi. |
| 4 | Login ketika session insert gagal | Resilience | **PASSED** | Login dibatalkan dengan `SESSION_INSERT_FAILED`, tidak ada token atau sesi yang bocor. |
| 5 | Login ketika refresh token insert gagal | Atomicity | **PASSED** | Kompensasi atomik menghapus `auth_sessions` yang sempat terbuat; database bersih. |
| 6 | Validasi token kedaluwarsa | Session Integrity | **PASSED** | Sesi dengan `expires_at` lampau ditolak dengan kode `TOKEN_EXPIRED`. |
| 7 | Session version mismatch | Invalidation | **PASSED** | Token dengan versi lama ditolak dengan `SESSION_REVOKED`; sesi langsung dicabut di DB. |
| 8 | Refresh token replay | Replay Protection | **PASSED** | Penggunaan ulang token yang sudah dirotasi ditolak dengan `REFRESH_TOKEN_REVOKED`. |
| 9 | Logout sesi tunggal | Session Revocation | **PASSED** | Sesi dan token dicabut di database; verifikasi ulang menghasilkan `SESSION_REVOKED`. |
| 10 | Reset password oleh Superadmin | Administration | **PASSED** | Password diubah ke bcrypt, `session_version` dinaikkan, seluruh sesi lama dicabut. |
| 11 | Revoke seluruh sesi aktif | Invalidation | **PASSED** | Seluruh sesi aktif pengguna dibatalkan sekaligus; semua token aktif ditolak. |
| 12 | Login kembali setelah ganti password | Full Lifecycle | **PASSED** | Password lama ditolak; password baru sukses dengan `session_version` terbaru. |

---

## 4. Evaluasi Risiko Tersisa & Rekomendasi Phase 2

1. **Eksekusi Migrasi di Database Live:**
   File migrasi `009_phase1_custom_auth_atomic_session_transaction.sql` dan `008_phase1_custom_auth_session_version_alignment.sql` telah disiapkan secara non-destruktif. Kode backend telah dirancang defensif untuk mendukung skema saat ini maupun setelah stored functions diterapkan. Migrasi fisik ke database produksi menunggu persetujuan dan jadwal pemeliharaan dari pemilik sistem.
2. **Ketergantungan Service Role Key:**
   Backend memerlukan `SUPABASE_SERVICE_ROLE_KEY` yang valid di environment produksi agar RLS bypass pada tabel-tabel internal autentikasi dapat beroperasi secara penuh.
3. **Integritas Data Work Order:**
   Dipastikan tidak ada perubahan struktur, query, mutasi, atau penghapusan data pada tabel `public.work_orders`. Tiga WO warisan yang dilindungi (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) tetap terlindungi secara mutlak.
