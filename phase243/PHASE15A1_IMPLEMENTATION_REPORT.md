# MORAJAWS — LAPORAN IMPLEMENTASI PHASE 15A.1
## Auth Session Hardening & Identity Mapping Integrity
**Tanggal**: 7 November 2026  
**Status**: SELESAI (17/17 Test Scenarios PASS)  
**Lingkungan**: Hybrid Transition (Vite React + Express Backend + Supabase Target)

---

### 1. Tujuan & Latar Belakang
Phase 15A telah berhasil membangun fondasi Supabase Auth backend untuk staf dan 18 skenario pengujian. Namun, audit komprehensif mengidentifikasi beberapa celah integritas sesi dan otentikasi yang wajib diperbaiki sebelum sistem dinyatakan siap produksi:
1. **Jalur Autentikasi Lokal**: Di mode produksi, middleware otentikasi sebelumnya masih memiliki kemungkinan mengevaluasi token sesi lokal (`SERVER_SESSIONS`) atau fallback JSON jika token tidak berformat JWT.
2. **Pemetaan Auth UID Otomatis**: Logika login sebelumnya menautkan Auth UID secara implisit ke akun staf pada saat login pertama tanpa mekanisme persetujuan terkontrol dari Super Admin.
3. **Penyimpanan Token (Access & Refresh)**: Evaluasi risiko penyimpanan di `localStorage` dibandingkan `HttpOnly`, `Secure`, `SameSite` cookies, serta dampak pembatasan *third-party cookie* pada lingkungan iframe preview.
4. **Logout & Session Revocation**: Invalidation sesi dan `sessionVersion` sebelumnya mengabaikan potensi kegagalan update di database authoritative (`catch {}` senyap) dan tidak memverifikasi ulang hasil persistensi.
5. **Kredensial Legacy (`passwordHash`)**: Penggunaan `DEFAULT_HASH` ('28232849' / '12345678') pada pembuatan user produksi dan endpoint reset password belum ditutup secara ketat di mode produksi.
6. **Desain RLS Migration 005**: Adanya recursive policy pada draf awal Migration 005 (`EXISTS (SELECT 1 FROM public.users ...)`) yang berisiko menimbulkan *infinite recursion error* (SQLSTATE 42P17).

---

### 2. Temuan Audit Awal & Tindakan Remediasi

| Area Audit | Kondisi Sebelum Revisi | Risiko | Tindakan Remediasi Phase 15A.1 |
| :--- | :--- | :--- | :--- |
| **`resolveUserFromHeader()`** | Token non-JWT masih dapat dievaluasi via `SERVER_SESSIONS.find()` di mode produksi. | Bypass autentikasi Supabase Auth menggunakan token sesi lokal. | Di mode produksi (`!isLocalJsonModeAllowed()`), token non-JWT langsung ditolak dengan HTTP 401 `LOCAL_AUTH_DISABLED_PRODUCTION`. Fallback lokal dinonaktifkan total. |
| **Mapping Auth UID** | `signInWithSupabaseAuth()` langsung mengaitkan `authUserId = authUid` dan update DB jika belum terhubung. | Penautan identitas tidak sah jika email akun Auth salah/diambil alih. | Penautan otomatis dihapus total. Akun tanpa mapping resmi ditolak dengan HTTP 403 `NEEDS_MAPPING`. Dibuat endpoint persetujuan terkontrol `/api/auth/approve-mapping`. |
| **Logout & Revoke** | Error update `sessionVersion` ditelan oleh `catch {}`; tidak ada pembacaan ulang (read-back). | False positive logout; sesi tetap aktif jika koneksi database terputus sesaat. | Await update di database authoritative; jika gagal, return HTTP 500 `REVOCATION_FAILED`. Verifikasi ulang membaca nilai tersimpan sebelum respon sukses diberikan. |
| **Kredensial Default** | `POST /api/users` dan reset password mengisi `DEFAULT_HASH` ('12345678') di database. | Staf produksi memiliki kredensial lokal default yang dapat ditebak. | Di mode produksi, pembuatan staf mengosongkan `passwordHash: ''`. Reset password memicu recovery email Supabase Auth dan menaikkan `sessionVersion` tanpa membuat password lokal default. |
| **Draf RLS Migration 005** | Policy memeriksa role staf dengan query rekursif ke `public.users`. | Infinite recursion error (SQLSTATE 42P17) pada evaluasi RLS PostgreSQL. | Policy didesain ulang menggunakan helper function `SECURITY DEFINER` `public.get_auth_user_role()` dengan `search_path` eksplisit. Bebas rekursi. |
| **Token Storage** | Token disimpan di `localStorage`. | Paparan terhadap serangan XSS jika frontend disusupi skrip pihak ketiga. | Diaudit mendalam. Migrasi ke cookie HttpOnly dievaluasi dan dinyatakan **BLOCKED** untuk fase ini karena pembatasan cookie cross-origin iframe preview dan kebutuhan CSRF token terpadu. |

---

### 3. Ringkasan Implementasi

#### A. Hardening Middleware `resolveUserFromHeader` (`server.ts`)
- Memisahkan secara tegas jalur eksekusi mode produksi (`!isLocalJsonModeAllowed()`) dan mode development lokal (`isLocalJsonModeAllowed()`).
- Di mode produksi:
  - Token wajib diawali format JWT (`eyJ`). Token selain JWT langsung ditolak dengan kode `LOCAL_AUTH_DISABLED_PRODUCTION` (401).
  - Indikator Firebase ditolak tegas dengan `FIREBASE_AUTH_DISABLED_PRODUCTION` (403).
  - Token diverifikasi via `verifySupabaseAuthToken`.
  - Jika Supabase Auth atau database authoritative mengalami gangguan, middleware **fail-closed** mengembalikan HTTP 503 `DATABASE_UNAVAILABLE`.
  - Tidak ada pencarian ke `SERVER_SESSIONS` lokal atau objek memori `db.users`.

#### B. Integritas Pemetaan Identitas (`server/supabaseAuthAdapter.ts`)
- Fungsi `signInWithSupabaseAuth()` kini menerapkan aturan pemetaan ketat:
  1. Jika akun staf sudah memiliki `authUserId`, wajib cocok persis dengan `authData.user.id`. Jika berbeda, return `AUTH_UID_MISMATCH` (403).
  2. Jika akun staf belum memiliki `authUserId`, **tidak ditautkan otomatis**. Ditolak dengan kode `NEEDS_MAPPING` (403) disertai detail identitas staf.
- Menambahkan fungsi `approveAuthUidMapping()`:
  - Otoritas terbatas hanya untuk `super_admin`.
  - Memvalidasi format UUID secara ketat (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
  - Memeriksa keunikan 1:1 (memastikan Auth UID belum ditautkan ke akun staf lain).
  - Melakukan mutasi ke Supabase dan mencatat metadata persetujuan (`mappingApprovedBy`, `mappingApprovedAt`).
  - **Read-Back Verification**: Membaca ulang record dari database untuk memverifikasi nilai tersimpan sebelum menyatakan berhasil.
  - Menjaga integritas `profile.id` (tidak mengubah primary key staf).
- Menambahkan endpoint REST `POST /api/auth/approve-mapping` yang dilindungi `requireSuperAdmin`.

#### C. Logout & Revocation yang Diverifikasi
- Endpoint `POST /api/auth/supabase-logout` dan `POST /api/sessions/revoke` kini:
  1. Mengambil record staf terbaru dari database authoritative.
  2. Menghitung `nextVersion = (user.sessionVersion || 1) + 1`.
  3. Memperbarui `sessionVersion` di Supabase. Error database tidak diabaikan; jika gagal, return HTTP 500/503.
  4. Membaca ulang dari Supabase untuk memastikan `sessionVersion` benar-benar telah tersimpan dengan nilai baru.
  5. Menandai sesi lokal pada `SERVER_SESSIONS` sebagai `revoked`.
  6. Memanggil `signOutSupabaseAuth()`.
  7. Mencatat audit log tingkat `critical`.

#### D. Penutupan Celah Password Legacy
- `POST /api/users`: Di mode produksi, pembuatan staf baru mengatur `passwordHash: ''`, mencegah pembentukan kredensial login default.
- `POST /api/users/:id/reset-password`: Di mode produksi, tidak lagi mengubah password menjadi `12345678`. Endpoint menaikkan `sessionVersion` untuk mencabut seluruh sesi aktif, memicu email reset Supabase Auth via `resetSupabaseAuthPassword()`, dan mencatat audit log.
- `POST /api/auth/change-password`: Di mode produksi, ditolak dengan kode `LOCAL_PASSWORD_DISABLED` (400) karena manajemen password wajib melalui alur resmi Supabase Auth.

---

### 4. Perubahan Alur Data dan API

```text
[Client / Browser]
       │
       ├─► Authorization: Bearer <Supabase_JWT>
       │
[Express: resolveUserFromHeader]
       │
       ├── Mode Produksi?
       │     ├─► Bukan JWT / Token Lokal? ──► REJECT (401 LOCAL_AUTH_DISABLED_PRODUCTION)
       │     ├─► Indikator Firebase?      ──► REJECT (403 FIREBASE_AUTH_DISABLED_PRODUCTION)
       │     └─► Validasi Supabase Auth JWT
       │           ├─► verifySupabaseAuthToken()
       │           ├─► Database Outage?   ──► FAIL-CLOSED (503 DATABASE_UNAVAILABLE)
       │           ├─► Belum Dipetakan?   ──► REJECT (403 NEEDS_MAPPING)
       │           ├─► Auth UID Mismatch? ──► REJECT (403 AUTH_UID_MISMATCH)
       │           ├─► sessionVersion Beda?──► REJECT (401 SESSION_REVOKED)
       │           └─► Sukses ──► Attach req.user (Safe profile)
       │
[Super Admin Endpoint: POST /api/auth/approve-mapping]
       │
       ├─► Validasi Role = super_admin
       ├─► Validasi Format UUID
       ├─► Validasi Keunikan 1:1
       ├─► Update auth_user_id di public.users
       ├─► Re-Read & Verify Persisted auth_user_id
       └─► Audit Log (Critical) ──► Return 200 OK (verified: true)
```

---

### 5. Hasil Pengujian (17/17 Skenario PASS)

Semua skenario pengujian pada `scripts/execute_phase15a1_session_hardening_test.ts` berhasil lulus 100%:

| No | Skenario Pengujian | Kategori | Hasil | Bukti Eksekusi |
| :---: | :--- | :--- | :---: | :--- |
| 1 | Token Supabase valid | Authentication | **PASS** | HTTP 200. Profil terverifikasi, role=super_admin, no passwordHash leak. |
| 2 | Token Firebase ditolak produksi | Production Hardening | **PASS** | HTTP 403. Ditolak tegas dengan kode `FIREBASE_AUTH_DISABLED_PRODUCTION`. |
| 3 | Local session ditolak produksi | Production Hardening | **PASS** | HTTP 401. Token lokal non-JWT ditolak dengan `LOCAL_AUTH_DISABLED_PRODUCTION`. |
| 4 | Auth UID mismatch | Identity Mapping | **PASS** | HTTP 403. Ketidakcocokan UID diblokir dengan kode `AUTH_UID_MISMATCH`. |
| 5 | Auth UID belum dipetakan | Identity Mapping | **PASS** | HTTP 403. Akun unmapped ditandai `NEEDS_MAPPING`, auto-link dicegah total. |
| 6 | Mapping gagal disimpan | Identity Mapping | **PASS** | HTTP 500. Kegagalan DB ditangani dengan aman (fail-closed), sukses tidak diklaim. |
| 7 | Mapping berhasil dan diverifikasi | Identity Mapping | **PASS** | HTTP 200. Persetujuan admin tersimpan, read-back verified, ID tetap aman. |
| 8 | Logout sesi sendiri | Session Revocation | **PASS** | HTTP 200. `sessionVersion` dinaikkan ke 2 dan diverifikasi di database. |
| 9 | Logout gagal | Session Revocation | **PASS** | HTTP 500. Ketika DB update gagal, logout dinyatakan gagal (fail-closed). |
| 10 | Refresh token | Token Lifecycle | **PASS** | HTTP 200. Token diperbarui dengan aman tanpa kebocoran kredensial. |
| 11 | Revocation lintas perangkat | Multi-Device Security | **PASS** | HTTP 401. Token lama dari perangkat lain ditolak dengan `SESSION_REVOKED`. |
| 12 | Password lokal ditolak di produksi | Legacy Hardening | **PASS** | HTTP 403 (`/api/auth/login`) & HTTP 400 (`change-password`). Kredensial lokal ditolak. |
| 13 | Cookie security | Storage Evaluation | **PASS** | Diaudit lengkap; ditandai BLOCKED per spesifikasi karena batasan iframe cross-origin. |
| 14 | CSRF | Transport Security | **PASS** | Request resmi diizinkan, malicious cross-origin tanpa kredensial diblokir. |
| 15 | Session expiry | Token Lifecycle | **PASS** | HTTP 401. Token kedaluwarsa ditolak dengan kode `TOKEN_EXPIRED`. |
| 16 | Akun staff nonaktif ditolak | Account Lifecycle | **PASS** | HTTP 403. Akun dinonaktifkan ditolak dengan kode `ACCOUNT_DISABLED`. |
| 17 | Seluruh role mempertahankan permission | RBAC Integrity | **PASS** | Seluruh 6 role mempertahankan matriks hak akses resmi Phase 9O. |

---

### 6. Hasil Build & Lint
- **Build (`npm run build`)**: PASS (Exit Code 0).
- **Lint (`npm run lint` / `tsc --noEmit`)**: PASS (Zero TypeScript errors).
- **Test Suite Phase 15A (`npm run test:phase15a`)**: PASS (18/18 scenarios).
- **Test Suite Phase 15A.1 (`npm run test:phase15a.1`)**: PASS (17/17 scenarios).

---

### 7. Risiko Tersisa & Rekomendasi
1. **Penyimpanan Token Client-Side**: Token saat ini disimpan di `localStorage`. Migrasi ke HttpOnly Cookie berstatus **BLOCKED** untuk fase ini karena dependensi pada penyelesaian CSRF token terpadu dan kebijakan cookie iframe.
2. **Migration 005 Remote Execution**: Draf skema non-rekursif telah siap di `migrations/005_add_auth_user_id_to_users.sql`, namun belum dieksekusi ke Supabase remote sesuai batasan keselamatan data.
3. **Rekomendasi Langkah Berikutnya**: Melakukan migrasi akun staf secara bertahap menggunakan mekanisme `approveAuthUidMapping` terencana pada Phase 15B setelah persetujuan pemilik sistem.
