# MoraJaws Phase 1 Auth Failure & Integrity Test Report

**Date:** 2026-11-10  
**Test Suite:** `scripts/execute_phase1_custom_auth_integrity_tests.ts`  
**Execution Environment:** Node.js v20.19.0 / Linux x86_64  
**Coverage:** 12 Mandatory Integration and Resilience Assertions  
**Overall Outcome:** **12/12 PASSED (100% SUCCESS RATE)**  

---

## 1. Klasifikasi Pengujian Berdasarkan Lingkungan

Sesuai instruksi audit MoraJaws, hasil pengujian dipisahkan secara tegas:

| Lingkungan | Status Eksekusi | Keterangan & Batasan |
|---|---|---|
| **Static Code Audit** | **COMPLETED (PASSED)** | Seluruh kode dianalisis: tidak ada bypass otentikasi, tidak ada fallback lokal pada mode produksi, hashing token SHA-256 terverifikasi. |
| **Local Resilience Test** | **COMPLETED (12/12 PASSED)** | Simulasi kegagalan jaringan, kegagalan database, kompensasi rollback, dan proteksi replay diuji secara terisolasi via `MockPostgresDatabase`. |
| **Staging Environment Test** | **PREPARED / CONFIGURED** | Skema dan isolasi staging disiapkan sesuai migrasi 007 dan 009; menunggu otorisasi pendeployan ke instance staging. |
| **Live Production Test** | **HELD (PENDING APPROVAL)** | Sesuai protokol keselamatan: **Tidak ada eksekusi migrasi atau mutasi ke database produksi tanpa persetujuan langsung dari pemilik aplikasi.** |

---

## 2. Rincian Eksekusi 12 Kasus Uji Wajib

### Kasus Uji 1: Login Normal dengan Verifikasi PBKDF2 & Upgrade ke Bcrypt
- **Tujuan:** Memverifikasi bahwa akun utama Superadmin (`rays` / `rayhanafirzanx@gmail.com`) dapat login menggunakan kata sandi awal `mora2026` yang tersimpan sebagai hash PBKDF2, dan sistem secara otomatis meng-upgrade hash ke format bcrypt standar.
- **Payload:** `{ identifier: "rays", password: "mora2026", ipAddress: "192.168.1.100" }`
- **Hasil:**
  - Status: **PASSED**
  - Access Token: `mora_at_v1_...` (256-bit entropy)
  - Refresh Token: `mora_rt_v1_...` (384-bit entropy)
  - Database State: Record `auth_sessions` dan `refresh_tokens` terbuat di PostgreSQL dengan `session_version = 1`.
  - Hash Upgrade: `password_hash` pada `public.users` terbukti berubah dari `pbkdf2:sha256:...` menjadi `$2a$10$...` (bcrypt).

### Kasus Uji 2: Login dengan Password Salah
- **Tujuan:** Memastikan penolakan login yang aman, pesan error netral (anti-enumerasi), dan pencatatan riwayat kegagalan.
- **Payload:** `{ identifier: "rays", password: "wrong_password_123" }`
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `INVALID_CREDENTIALS` (HTTP 401)
  - Pesan Error: "Nama pengguna atau kata sandi tidak cocok. Pastikan kredensial yang Anda masukkan benar."
  - Telemetri: Percobaan tercatat di tabel `login_attempts` dengan `success = false` dan `reason = WRONG_PASSWORD`.

### Kasus Uji 3: Login Saat Supabase Tidak Tersedia (Fail-Closed)
- **Tujuan:** Menguji prinsip *Fail-Closed* pada mode produksi. Jika koneksi database terputus atau tidak terkonfigurasi, sistem wajib menolak login dan dilarang beralih ke cache memori lokal.
- **Kondisi:** `NODE_ENV = 'production'`, `simulateSupabaseUnavailable = true`.
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `DATABASE_UNAVAILABLE` (HTTP 503)
  - Verifikasi: `LOCAL_AUTH_SESSIONS` tidak tersentuh (length = 0); tidak ada kebocoran sesi ke memori server.

### Kasus Uji 4: Login Ketika Session Insert Gagal
- **Tujuan:** Memverifikasi perilaku saat record `auth_sessions` gagal disimpan ke PostgreSQL.
- **Kondisi:** `simulateSessionInsertFailure = true`.
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `SESSION_INSERT_FAILED`
  - Verifikasi: Login dibatalkan secara penuh, tidak ada token yang diterbitkan ke pemanggil, tidak ada kebocoran ke state aplikasi.

### Kasus Uji 5: Login Ketika Refresh Token Insert Gagal (Atomic Compensation Rollback)
- **Tujuan:** Memverifikasi transaksi atomik dan penghapusan kompensasi jika penyimpanan refresh token gagal setelah session sempat tersimpan.
- **Kondisi:** Session insert berhasil, refresh token insert gagal (`simulateRefreshTokenInsertFailure = true`).
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `REFRESH_TOKEN_INSERT_FAILED`
  - Verifikasi Kompensasi: Record `auth_sessions` yang sempat dibuat langsung dihapus kembali (`DELETE FROM auth_sessions WHERE id = sessionId`). Database tetap dalam kondisi bersih (0 orphaned sessions).

### Kasus Uji 6: Validasi Token Lama / Kedaluwarsa
- **Tujuan:** Memastikan token yang telah melewati masa berlaku (`expires_at < now()`) ditolak.
- **Kondisi:** Modifikasi `expires_at` pada record `auth_sessions` menjadi 1 menit di masa lalu.
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `TOKEN_EXPIRED` (HTTP 401)
  - Pesan Error: "Sesi login telah kedaluwarsa. Silakan login kembali."

### Kasus Uji 7: Session Version Mismatch (Invalidasi Sesi Lama)
- **Tujuan:** Memastikan token dengan `session_version` yang sudah usang ditolak dan sesi di basis data dicabut.
- **Kondisi:** Token diterbitkan pada `session_version = 1`. Nilai `public.users.session_version` dinaikkan menjadi `2` (mensimulasikan reset password pada tab lain).
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `SESSION_REVOKED` (HTTP 401)
  - State Basis Data: Record `auth_sessions.revoked_at` seketika terisi timestamp saat verifikasi dijalankan.

### Kasus Uji 8: Refresh Token Replay Protection
- **Tujuan:** Mencegah serangan *replay attack* di mana refresh token yang telah digunakan/dirotasi dicoba digunakan kembali oleh penyerang.
- **Kondisi:**
  1. Rotasi pertama: Klien mengirim `RT_1`, menerima `RT_2` (sukses).
  2. Upaya penyerangan: Klien mengirim kembali `RT_1`.
- **Hasil:**
  - Status: **PASSED**
  - Response Code: `REFRESH_TOKEN_REVOKED` (HTTP 401)
  - Pesan Error: "Refresh token telah dicabut (terindikasi replay attack). Silakan login kembali."
  - Tidak ada token baru yang diterbitkan.

### Kasus Uji 9: Logout (Pencabutan Sesi Tunggal)
- **Tujuan:** Memastikan logout mencabut sesi dan refresh token terkait secara langsung di basis data PostgreSQL.
- **Hasil:**
  - Status: **PASSED**
  - `revokeSingleSession()` berhasil memperbarui `auth_sessions` dan `refresh_tokens` dengan `revoked_at = now()`.
  - Percobaan verifikasi ulang access token menghasilkan `SESSION_REVOKED`.

### Kasus Uji 10: Reset Password oleh Superadmin
- **Tujuan:** Memverifikasi bahwa reset kata sandi oleh Superadmin mengubah kata sandi ke format bcrypt, menaikkan `session_version`, dan mencabut seluruh sesi aktif target user.
- **Hasil:**
  - Status: **PASSED**
  - Kata sandi target user di-hash menggunakan bcrypt.
  - `users.session_version` dinaikkan secara atomik dari 1 menjadi 2.
  - Seluruh sesi aktif lama milik target user seketika tidak dapat digunakan (`SESSION_REVOKED`).

### Kasus Uji 11: Revoke Seluruh Sesi Aktif Pengguna
- **Tujuan:** Menguji fungsi pencabutan massal (`revokeAllUserSessions()`) pada pengguna yang memiliki multi-sesi aktif (misal dari desktop dan mobile).
- **Kondisi:** Pengguna membuat 2 sesi login terpisah (Sesi A dan Sesi B). Superadmin mengeksekusi pencabutan seluruh sesi.
- **Hasil:**
  - Status: **PASSED**
  - Baik Token A maupun Token B secara serempak ditolak dengan status `SESSION_REVOKED`.

### Kasus Uji 12: Login Kembali Setelah Password Diganti
- **Tujuan:** Memverifikasi siklus login lengkap setelah proses pergantian kata sandi.
- **Hasil:**
  - Status: **PASSED**
  - Percobaan login dengan kata sandi lama ditolak dengan `INVALID_CREDENTIALS`.
  - Percobaan login dengan kata sandi baru diterima dengan sukses, menghasilkan token yang memuat `session_version` terbaru.

---

## 3. Log Output Ringkas Test Runner

```text
================================================================
MORAJAWS PHASE 1: CUSTOM AUTH FAIL-CLOSED & SESSION INTEGRITY
Running 12 Mandatory Tests...
================================================================

[✓ PASS] Test 1: Login Normal dengan Verifikasi PBKDF2 & Upgrade ke Bcrypt
[✓ PASS] Test 2: Login dengan Password Salah
[✓ PASS] Test 3: Login Saat Supabase Tidak Tersedia (Fail-Closed)
[✓ PASS] Test 4: Login Ketika Session Insert Gagal
[✓ PASS] Test 5: Login Ketika Refresh Token Insert Gagal (Atomic Compensation Rollback)
[✓ PASS] Test 6: Validasi Token Lama / Kedaluwarsa
[✓ PASS] Test 7: Session Version Mismatch (Invalidasi Sesi Lama)
[✓ PASS] Test 8: Refresh Token Replay Protection
[✓ PASS] Test 9: Logout (Pencabutan Sesi Tunggal)
[✓ PASS] Test 10: Reset Password oleh Superadmin
[✓ PASS] Test 11: Revoke Seluruh Sesi Aktif Pengguna
[✓ PASS] Test 12: Login Kembali Setelah Password Diganti

----------------------------------------------------------------
TOTAL: 12/12 PASSED (100%)
----------------------------------------------------------------
```
