# MORAJAWS — PHASE 15A: SECURITY AUDIT & HARDENING REPORT
**Tinjauan Keamanan Autentikasi Produksi & Model Ancaman**  
**Tanggal**: 7 November 2026  
**Auditor**: Senior Application Security Engineer & Supabase Security Reviewer  
**Status**: LULUS (ZERO CRITICAL / HIGH VULNERABILITIES)

---

## 1. Model Ancaman & Mitigasi (Threat Modeling)

Dalam arsitektur transisi MoraJaws menuju Supabase Auth, tim security mengidentifikasi dan memitigasi vektor ancaman sebagai berikut:

| Vektor Ancaman | Dampak Potensial | Mitigasi yang Diterapkan di Phase 15A | Status |
| :--- | :--- | :--- | :---: |
| **Credential Brute-Force** | Penyerang menebak password staff melalui endpoint login | Implementasi `LOGIN_ATTEMPTS` rate limiting berbasis kombinasi IP dan identifier. Maksimal 5 percobaan gagal sebelum dikunci (lockout) 5 menit. Reset otomatis saat login berhasil. | **TERLINDUNGI** |
| **Email/Username Directory Harvesting** | Penyerang menggunakan `/api/auth/resolve-identity` untuk mencuri daftar email staff | Payload response `/api/auth/resolve-identity` dibersihkan total dari atribut `email`. Hanya mengembalikan boolean `registered` dan `name` tersanitasi. | **TERLINDUNGI** |
| **Bypass via Stale Local Sessions** | Penyerang menggunakan session lokal JSON atau token kedaluwarsa | `resolveUserFromHeader` menolak tegas token tidak valid/kedaluwarsa (HTTP 401). Pengecekan Supabase Auth dilakukan secara real-time ke GoTrue tanpa toleransi fallback lokal di mode produksi. | **TERLINDUNGI** |
| **Firebase Auth Token Reuse** | Penyerang menyusupkan token ID Firebase warisan untuk membobol endpoint produksi | `server.ts` mendeteksi header `x-auth-provider: firebase` dan format token Firebase di mode produksi, segera memblokir dengan `HTTP 403 FIREBASE_AUTH_DISABLED_PRODUCTION`. | **TERLINDUNGI** |
| **Auth UID Spoofing / Impersonation** | Token Supabase Auth valid milik satu akun dipetakan ke profil staff lain | `signInWithSupabaseAuth` dan `verifySupabaseAuthToken` memvalidasi keterikatan `authUserId` dengan `profile.id` atau `profile.payload.authUserId`. Jika terjadi ketidakcocokan, sistem segera memblokir dengan `HTTP 403 AUTH_UID_MISMATCH`. | **TERLINDUNGI** |
| **Cross-Device Session Hijacking** | Pengguna yang dinonaktifkan atau logout di satu perangkat tetap aktif di perangkat lain | Implementasi `sessionVersion`. Saat pengguna logout atau sesi dicabut via `/api/sessions/revoke`, `sessionVersion` pengguna dinaikkan, sehingga seluruh token sesi aktif lainnya di semua perangkat langsung ditolak (HTTP 401 `SESSION_REVOKED`). | **TERLINDUNGI** |
| **Cross-Contractor / Cross-WO Tampering** | Leader mengakses contractor lain atau Installer mengakses WO bukan miliknya | Validasi otorisasi server-side di Express: Leader dibatasi hanya pada `contractor_id` terdaftar (`HTTP 403 SCOPE_MISMATCH`), Installer dibatasi hanya pada WO yang ditugaskan (`HTTP 403`). | **TERLINDUNGI** |
| **Service Role Key / Secret Leakage** | Kunci admin Supabase bocor ke bundel frontend atau log response | Audit komprehensif membuktikan bundel `dist/` dan respons API bersih dari `SUPABASE_SERVICE_ROLE_KEY`, `passwordHash`, maupun connection string database. Plugin Vite ViteSecurityShield otomatis memotong file arsip dan artefak sensitif. | **TERLINDUNGI** |

---

## 2. Analisis Keamanan Endpoint Autentikasi

### A. Endpoint `/api/auth/supabase-login`
- **Metode**: `POST`
- **Input**: `{ identifier, password }`
- **Validasi**:
  1. Input string non-kosong, pembersihan whitespace.
  2. Rate limit lookup: memeriksa jumlah percobaan gagal dari pasangan IP dan username.
  3. Authoritative check: memastikan akun belum soft-deleted (`isDeleted !== true`), aktif (`active !== false`), dan memiliki peran resmi MoraJaws (`super_admin`, `dispatch`, `leader`, `installer`, `management_data`, `it_support`).
  4. Password verification: didelegasikan ke Supabase Auth (`client.auth.signInWithPassword`). Server Express tidak pernah menyimpan ataupun membandingkan password mentah atau hash buatan sendiri di lingkungan produksi.
  5. Profile sanitization: kolom `passwordHash` dihapus dari objek user yang dikembalikan ke browser.

### B. Endpoint `/api/auth/supabase-refresh`
- **Metode**: `POST`
- **Input**: `{ refreshToken }`
- **Validasi**:
  1. Mengirim `refresh_token` ke Supabase Auth `client.auth.refreshSession`.
  2. Menerima access token baru dan refresh token terbarukan.
  3. Memastikan sesi lama yang telah dicabut tidak dapat diperbarui.

### C. Endpoint `/api/auth/supabase-logout`
- **Metode**: `POST` (Require Bearer Token)
- **Aksi Keamanan**:
  1. Memanggil `client.auth.signOut()`.
  2. Menandai status sesi `revoked` di `SERVER_SESSIONS`.
  3. Menginkrementasi `sessionVersion` akun di database PostgreSQL.

### D. Endpoint `/api/sessions/revoke`
- **Metode**: `POST` (Require Superadmin)
- **Aksi Keamanan**:
  1. Hanya role `super_admin` yang dapat memanggil.
  2. Mencabut sesi target spesifik (`sessionId`).
  3. Menginkrementasi `sessionVersion` user target untuk menginvalidasi seluruh token aktif secara simultan.

---

## 3. Isolasi Role & Otorisasi RBAC

Pengujian Test #14, #15, dan #16 memverifikasi penegakan RBAC secara tegas di level Express backend:
1. **Superadmin**: Memiliki akses penuh terhadap mutasi konfigurasi global (`POST /api/config/global`), manajemen user, dan audit logs.
2. **Leader (Korlap)**:
   - Terkunci hanya pada `contractor_id` miliknya. Upaya menetapkan atau mengubah tiket kontraktor lain diblokir dengan `HTTP 403`.
   - Live Chat terkunci dalam status **read-only** (`LEADER_READ_ONLY_CHAT`).
   - Dilarang memodifikasi konfigurasi sistem global (`HTTP 403 REQUIRE_CONFIG_PERMISSION`).
3. **Installer (Teknisi)**:
   - Terkunci hanya pada tiket yang ditugaskan ke namanya. Upaya mengirim progres pada tiket milik teknisi lain diblokir dengan `HTTP 403`.
   - Dilarang mengakses endpoint manajemen user (`HTTP 403`).
   - Tampilan UI mobile terkunci tanpa sidebar, hanya 4 tab navigasi (Tugasnya/Dashboard, Tugas Saya, WhatsApp, Live Chat).

---

## 4. Perlindungan Record Terproteksi (Protected WO Immutability)

3 Work Order produksi yang dilindungi tetap terlindungi secara mutlak:
1. `wo_1793825457141_u4bnht` (`WO-EXPRESS-TEST-1793825456810`)
2. `wo_imp_1793825458959_4i4f1h` (`WO-DUP-TEST-1793825458804`)
3. `wo_imp_1793825458959_262dei` (`WO-DUP-TEST-1793825458804-UNIQUE`)

Setiap percobaan penugasan ulang, mutasi status, pemulihan, atau penghapusan terhadap ketiga ID ini langsung ditolak dengan `HTTP 403 PROTECTED_PRODUCTION_RECORD`.

---

## 5. Kesimpulan Audit Keamanan

Sistem autentikasi MoraJaws pada Phase 15A telah memenuhi seluruh standar keamanan produksi:
- Tidak ada kredensial service role key di sisi klien.
- Tidak ada mekanisme fallback yang melemahkan autentikasi.
- Seluruh verifikasi identitas terikat kuat dengan Supabase Auth dan tabel `users` authoritative.
- Keamanan siap untuk peninjauan pemilik sistem sebelum migrasi data akun produksi.
