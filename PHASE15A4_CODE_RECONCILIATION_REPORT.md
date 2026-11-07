# MORAJAWS — PHASE 15A.4 CODE RECONCILIATION REPORT

## 1. Tujuan Rekonsiliasi Kode
Merekonsiliasi seluruh endpoint, format request/response, penanganan sesi, dan mapping pengguna antara Frontend (`src/`), Backend Express (`server.ts`), dan Adapter Supabase (`server/supabaseAdapter.ts`, `server/supabaseAuthAdapter.ts`).

## 2. Hasil Rekonsiliasi Endpoint & Data Flow
| Endpoint | Method | Status Rekonsiliasi | Detail & Verifikasi |
| :--- | :---: | :---: | :--- |
| `/api/bootstrap` | GET | TERSINKRONISASI | Mengembalikan payload publik aman saat tanpa token (tickets kosong, tanpa sheetsConfig). Mengembalikan profil & tiket ter-scope saat terautentikasi. |
| `/api/auth/supabase-login` | POST | TERSINKRONISASI | Menerima identifier & password, memvalidasi dengan Supabase Auth via Express. Mengembalikan token & user metadata aman. |
| `/api/auth/supabase-logout` | POST | TERSINKRONISASI | Menghapus server session, menaikkan sessionVersion di Supabase DB, dan membatalkan refresh token. |
| `/api/auth/supabase-refresh` | POST | TERSINKRONISASI | Menerima refreshToken dan memperbarui access token tanpa perantara browser langsung ke Supabase. |
| `/api/auth/change-password` | POST | TERSINKRONISASI | Memvalidasi larangan kata sandi default `12345678` sebelum verifikasi hash kata sandi lama. Membatalkan sesi aktif lainnya. |
| `/api/storage/refresh-signed-url` | POST | TERSINKRONISASI | Mendukung pengecekan WO di Supabase mode dan memblokir akses lintas kontraktor (HTTP 403). |
| `/api/storage/download` | GET | TERSINKRONISASI | Memvalidasi parameter storagePath dan otorisasi kontraktor sebelum streaming file. |
| `/api/whatsapp/preview` | POST | TERSINKRONISASI | Mendukung variabel camelCase dan snake_case (`customerName`, `customer_name`), mengembalikan `{ success: true, renderedText, clickToChatUrl }`. |
| `/api/realtime/stream-sandbox` | GET | TERSINKRONISASI | Dilindungi `requireRealtimeSandboxEnabled`; mengembalikan HTTP 403 `FEATURE_DISABLED` pada lingkungan produksi. |
| `/api/sandbox/journal/mutate` | POST | TERSINKRONISASI | Dilindungi `requireSandboxEnabled`; mengembalikan HTTP 403 `SANDBOX_DISABLED` pada lingkungan produksi. |

## 3. Rekonsiliasi Role & Hak Akses (RBAC)
- **Super Admin**: Akses penuh ke seluruh fitur, konfigurasi, user management, dan audit logs.
- **Dispatch**: Akses penuh ke penugasan WO, scheduling, WhatsApp preview, dan sinkronisasi internal. Ditolak dari konfigurasi Google Sheets atau delete massal tanpa otorisasi.
- **Leader**: Akses terisolasi ketat pada kontraktor dan area terdaftarnya. Ditolak melihat WO kontraktor lain, dilarang mengirim chat live (read-only), dilarang mengarsipkan/memulihkan WO.
- **Installer**: Akses terbatas pada tiket yang ditugaskan kepadanya. Tidak memiliki sidebar; bottom nav terbatas pada 4 menu (Dashboard/Tugasnya, Tugas Saya, WhatsApp, Live Chat). Ditolak dari seluruh endpoint administrasi.
- **Management Data**: Akses portal data, bulk import, dan audit status WO. Ditolak dari mutasi WO terproteksi.
- **IT Support**: Akses monitoring kesehatan sistem, droplist configuration, dan audit log viewer. Ditolak dari manipulasi tiket operasional lapangan.

## 4. Status Eliminasi Fallback Tak Aman
- Firebase Auth dan Local JSON auth secara tegas dinonaktifkan di mode produksi (HTTP 403 `FIREBASE_AUTH_DISABLED_PRODUCTION` & `DEPRECATED_AUTH_ENDPOINT`).
- Bypass header yang tidak terverifikasi (`x-user-id`, `x-username`) telah dihilangkan sepenuhnya; otorisasi wajib melalui verified Bearer token / Supabase Auth JWT.
