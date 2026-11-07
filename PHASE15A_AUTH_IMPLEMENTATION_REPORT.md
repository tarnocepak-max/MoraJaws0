# MORAJAWS — PHASE 15A: SUPABASE AUTH IMPLEMENTATION REPORT
**Dokumen Arsitektur & Implementasi Autentikasi Produksi MoraJaws**  
**Tanggal**: 7 November 2026  
**Status**: SELESAI (18/18 Skenario Uji Lulus, 100% Bukti HTTP Loopback Tervalidasi)  
**Target Lingkungan**: Produksi (Express Backend → Supabase Auth & PostgreSQL)

---

## 1. Ringkasan Eksekutif & Tujuan Phase

Phase 15A berhasil menyelesaikan migrasi arsitektur autentikasi staff MoraJaws dari sistem autentikasi campuran (Firebase Auth & hash lokal) menuju **Supabase Auth sebagai satu-satunya Identity Provider produksi**.

### Prinsip Utama yang Dipertahankan:
1. **Zero Client-Side Supabase Initialization**: Browser/frontend tidak pernah memanggil `createClient` Supabase secara langsung ataupun menerima `SUPABASE_SERVICE_ROLE_KEY`. Seluruh interaksi Auth dijembatani oleh server Express (`/api/auth/*`).
2. **Username & Email Preservation**: Staff dapat login menggunakan username lama tanpa mengharuskan input email langsung dari UI browser, melalui mekanisme server-side resolution yang aman tanpa kebocoran direktori email.
3. **No Mass Password Reset**: Akun staff lama tidak direset massal; tidak ada pembuatan akun Superadmin liar atau pengubahan data Work Order.
4. **Authoritative Staff Profile & RBAC**: Setiap sesi login memvalidasi integritas identitas secara berjenjang:
   $$\text{Supabase Auth UID} \longrightarrow \text{public.users.auth\_user\_id} \longrightarrow \text{Profil Staff} \longrightarrow \text{Role} \longrightarrow \text{Permissions}$$
5. **Fail-Closed & Anti-Fallback**: Mode produksi menolak keras token Firebase (`FIREBASE_AUTH_DISABLED_PRODUCTION`) dan menolak verifikasi hash password lokal (`DEPRECATED_AUTH_ENDPOINT`). Jika Supabase tidak tersedia, sistem fail-closed dengan HTTP 503.

---

## 2. Arsitektur Alur Login Supabase Auth (12 Tahap Presisi)

Implementasi alur login staff memenuhi 12 tahap spesifikasi teknis tanpa deviasi:

```
[Browser / StaffLoginPortal / LoginModal]
               │  1. Masukkan identifier (username/email) + password
               ▼
[POST /api/auth/supabase-login]
               │  2. Validasi format & Brute-Force Rate Limiting (max 5 gagal / IP+Identifier)
               ▼
[server/supabaseAuthAdapter.ts]
               │  3. Identifier resolution: jika username, query tabel authoritative public.users
               │     (Tidak mengirim email list ke browser; lookup internal server-side)
               ▼
[authoritative public.users checks]
               │  4. Validasi status akun:
               │     - is_deleted === true  → HTTP 403 (ACCOUNT_DELETED)
               │     - active === false     → HTTP 403 (ACCOUNT_DISABLED)
               │     - role tidak valid     → HTTP 403 (INVALID_ROLE)
               ▼
[Supabase Auth Service (Admin API / GoTrue)]
               │  5. client.auth.signInWithPassword({ email, password })
               │     - Password salah       → HTTP 401 (auth/wrong-password)
               ▼
[Identity & UID Verification]
               │  6. Validasi Supabase Auth UID:
               │     - Jika profil sudah memiliki auth_user_id dan != Auth UID:
               │       → HTTP 403 (AUTH_UID_MISMATCH)
               │     - Jika belum terhubung, link authUserId ke payload user
               ▼
[Authoritative Staff Profile Query]
               │  7. Query ulang profil terbaru dari public.users (Step 8)
               │     - Profil tidak ada     → HTTP 404 (PROFILE_NOT_FOUND)
               ▼
[Unified Session Tracking]
               │  8. Buat active session di SERVER_SESSIONS (in-memory tracking)
               │     - Catat sessionId, sessionVersion, IP, User-Agent, Device Type
               ▼
[Response to Frontend]
               │  9. Response JSON aman (HTTP 200):
               │     - tokens: accessToken, refreshToken, expiresIn, tokenType
               │     - user: profil aman (passwordHash dihapus secara mutlak)
               │     - sessionId
               ▼
[Frontend UI Navigation]
               │ 10. authService.ts menyimpan tokens di memory/storage aman
               │ 11. Role-based redirection (Superadmin → Dashboard, Leader → Tugas Korlap, Installer → Tugas Saya)
```

---

## 3. Spesifikasi Endpoint Backend & Siklus Hidup Token

| Endpoint | Method | Otorisasi | Fungsi & Penanganan Siklus Hidup |
| :--- | :---: | :---: | :--- |
| `/api/auth/supabase-login` | `POST` | Publik / IP Rate Limit | Login staf dengan username/email + password melalui Supabase Auth. Memvalidasi status aktif, role valid, dan Auth UID matching. |
| `/api/auth/supabase-refresh`| `POST` | Publik / Refresh Token | Memperbarui accessToken dan refreshToken menggunakan Supabase Auth refresh session API. |
| `/api/auth/supabase-logout` | `POST` | Bearer Token | Mengakhiri sesi pengguna: memanggil `signOut` Supabase Auth, menandai status sesi `revoked`, dan menaikkan `sessionVersion`. |
| `/api/auth/me` | `GET` | Bearer Token | Memverifikasi token JWT Supabase Auth secara kriptografis dan mengembalikan profil pengguna mutakhir. |
| `/api/auth/resolve-identity`| `POST` | Publik | Memeriksa apakah identifier terdaftar di sistem. **Keamanan**: Tidak mengembalikan email pengguna untuk mencegah directory harvesting. |
| `/api/sessions/revoke` | `POST` | Superadmin | Mencabut sesi pengguna target dari jarak jauh. Mengubah status sesi menjadi `revoked` dan menginkrementasi `sessionVersion` pengguna untuk menginvalidasi seluruh token aktif secara cross-device. |
| `/api/auth/firebase-login` | `POST` | Terblokir di Produksi | Mengembalikan `HTTP 403 FIREBASE_AUTH_DISABLED_PRODUCTION` di mode produksi. |
| `/api/auth/login` (legacy) | `POST` | Terblokir di Produksi | Mengembalikan `HTTP 403 DEPRECATED_AUTH_ENDPOINT` di mode produksi. |

---

## 4. Perlindungan Token & Resolusi Header (`resolveUserFromHeader`)

Middleware `resolveUserFromHeader` pada `server.ts` diperkuat untuk menerapkan verifikasi tanpa celah:
1. **Deteksi Token Firebase**: Request dengan header `x-auth-provider: firebase` atau format token non-JWT Firebase langsung ditolak dengan `HTTP 403 FIREBASE_AUTH_DISABLED_PRODUCTION`.
2. **Kriptografi Supabase JWT**: Token `Bearer eyJ...` diverifikasi via `client.auth.getUser(token)`.
3. **Pembedaan Status Error**:
   - Kedaluwarsa (`isExpired`): Menghasilkan `HTTP 401 TOKEN_EXPIRED`.
   - Rusak/palsu: Menghasilkan `HTTP 401 TOKEN_INVALID`.
   - Akun dinonaktifkan: Menghasilkan `HTTP 403 ACCOUNT_DISABLED`.
   - Sesi dicabut / versi sesi tidak cocok: Menghasilkan `HTTP 401 SESSION_REVOKED`.
4. **Pencegahan Bypass Fallback**: Jika verifikasi token Supabase gagal, proses autentikasi **segera berhenti** dan mengembalikan status 401/403. Tidak ada fallback ke session lokal atau dummy user.

---

## 5. Ringkasan Keselamatan Data & Integritas Akun

- **Password Hash**: Kolom `passwordHash` dihapus dari seluruh response JSON API `/api/auth/*` dan `/api/users/*`.
- **Protected WO Records**: 3 tiket work order yang dilindungi tetap terlindungi dan tidak mengalami mutasi:
  - `wo_1793825457141_u4bnht`
  - `wo_imp_1793825458959_4i4f1h`
  - `wo_imp_1793825458959_262dei`
- **Zero Production Remote Mutation**: Seluruh pengujian Phase 15A dieksekusi menggunakan test harness loopback terisolasi. Tidak ada DDL/DML yang dijalankan ke database Supabase remote tanpa izin pemilik sistem.
