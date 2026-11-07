# MORAJAWS — PHASE 15A.6 SESSION SECURITY REPORT
**Topik**: Pengerasan Keamanan Sesi, Manajemen Token & Isolasi Lingkungan  
**Status**: DIVERIFIKASI & PASS 100%  

---

## 1. Kebijakan Keamanan dan Arsitektur Sesi
Sesuai arsitektur target MoraJaws:
- **Provider Autentikasi Produksi Tunggal**: Supabase Auth melalui backend Express.
- **Frontend Sesi**: Browser klien hanya berinteraksi dengan API Express; tidak ada inisialisasi Supabase Client atau pembacaan service-role key di browser.
- **Penyimpanan Token**: Token sesi (`accessToken`, `refreshToken`) disimpan di `localStorage` klien dengan proteksi header `Authorization: Bearer <token>`.
  - Catatan: Evaluasi HttpOnly Cookie ditandai status `BLOCKED` (bukan bug) karena lingkungan deployment AI Studio berjalan di dalam iframe cross-origin dengan kebijakan strict third-party cookie blocking.

---

## 2. Implementasi Pengerasan Sesi (Session Hardening)

### A. Revokasi Sesi Multi-Perangkat (`sessionVersion`)
- Setiap profil pengguna di database memiliki kolom `sessionVersion` (integer, default 1).
- Saat pengguna logout dari satu perangkat atau saat Super Admin mengubah status akun/password, `sessionVersion` pengguna dinaikkan (`+1`) di database.
- Saat token JWT Supabase diverifikasi di middleware backend (`resolveUserFromHeader`):
  - Sistem membandingkan `sessionVersion` pada sesi dengan `sessionVersion` terkini di database authoritative.
  - Jika terjadi perbedaan versi, token langsung ditolak dengan kode `SESSION_REVOKED` (HTTP 401).

### B. Shared Backend Client Safety pada Logout
- **Ketentuan Keamanan**: Pada backend bersama (shared server), pemanggilan `client.auth.signOut()` akan menghapus kredensial klien secara global untuk seluruh request yang sedang berlangsung.
- **Implementasi**:
  Endpoint `POST /api/auth/supabase-logout` tidak memanggil `client.auth.signOut()`, melainkan:
  1. Menandai record sesi di server sebagai `revoked`.
  2. Menaikkan `sessionVersion` di database authoritative secara transaksional (fail-closed).
  3. Mengembalikan `sessionVersion` baru ke klien.

### C. Cutover Guards Terhadap Legacy Auth
- **Firebase Token Blocking**:
  Jika header `x-auth-provider: firebase` diterima di lingkungan produksi (atau saat Supabase mode aktif), backend menolak seketika dengan HTTP 403 `FIREBASE_AUTH_DISABLED_PRODUCTION`.
- **Local Session Token Blocking**:
  Jika token berawalan `mora_` (token sesi lokal) dikirimkan saat mode JSON lokal tidak diizinkan, backend menolak dengan HTTP 401 `LOCAL_AUTH_DISABLED_PRODUCTION`.
- **Legacy Password Mutation Blocking**:
  Endpoint `/api/auth/change-password` memblokir mutasi password lokal pada mode Supabase dengan mengembalikan HTTP 400 `LOCAL_PASSWORD_DISABLED` dan mengarahkan ke alur reset password resmi.

### D. Pencegahan Kebocoran Informasi (Information Leakage Prevention)
1. **Endpoint `/api/auth/resolve-identity`**:
   - Respon publik untuk resolusi identitas username hanya mengembalikan `{ exists, username, role, contractor, area }`.
   - Kolom `email` dan `passwordHash` **dihapus total** dari respon untuk mencegah panen data (email harvesting) oleh pihak luar.
2. **Scan Bundel Produksi (`dist/`)**:
   - Seluruh file JavaScript dan HTML pada direktori `dist/` diaudit bebas 100% dari:
     - `SUPABASE_SERVICE_ROLE_KEY`
     - String koneksi `postgres://`
     - Nilai rahasia JWT secret
     - Inisialisasi langsung `createClient` di bundle browser.

---

## 3. Matriks Pengujian Keamanan Sesi
| Skenario Pengujian | Target Endpoint | Status Hasil |
| :--- | :--- | :--- |
| Token Supabase Valid | `GET /api/auth/me` | **PASS (HTTP 200)** |
| Token Firebase Ditolak di Produksi | `GET /api/auth/me` | **PASS (HTTP 403)** |
| Token Lokal Ditolak di Produksi | `GET /api/auth/me` | **PASS (HTTP 401)** |
| Pemutusan Sesi Lintas Perangkat | `GET /api/auth/me` | **PASS (HTTP 401 SESSION_REVOKED)** |
| Token Kedaluwarsa | `GET /api/auth/me` | **PASS (HTTP 401 TOKEN_EXPIRED)** |
| Proteksi CSRF | Request Validator | **PASS (Valid Origin Allowed, Malicious Blocked)** |
| Kebocoran Secret & Hash | Seluruh Response API | **PASS (Zero Leaks)** |
