# MORAJAWS — PHASE 15A.6 BASELINE AUDIT REPORT
**Tanggal Audit**: 7 November 2026  
**Status**: SELESAI  
**Target Aplikasi**: MoraJaws FTTH Operations System (MoraJaws0)  

---

## 1. Ringkasan Eksekutif Baseline
Audit awal dilakukan terhadap repository aktual MoraJaws0 sebelum modifikasi kode dilakukan. Audit menelusuri seluruh layer: Frontend (React 19 + Vite), Backend (Express 4.21 + tsx), Adapter Layer (`server/supabaseAdapter.ts`, `server/supabaseAuthAdapter.ts`, `server/supabaseClient.ts`), state management (`AppContext.tsx`), serta komponen UI login (`StaffLoginPortal.tsx`, `LoginModal.tsx`).

Tujuan audit baseline adalah membuktikan kondisi riil sistem terkait error operasional utama:
- **Error Code**: `MJ-AUTH-001`
- **Module**: `Authentication`
- **Operation**: `Staff Credential Login`
- **Pesan**: `Autentikasi gagal. Kredensial tidak cocok.`

---

## 2. Inventaris Komponen dan Versi Runtime Aktual
| Komponen / Dependensi | Versi Terpasang | Status Pemeriksaan |
| :--- | :--- | :--- |
| **Node.js** | v22.13.0 | Kompatibel & Stabil |
| **React / React-DOM** | 19.0.0 | Kompatibel |
| **Vite** | 6.1.0 | Build lulus (1695 modul) |
| **Express** | 4.21.2 | Endpoint REST aktif |
| **@supabase/supabase-js** | 2.118.0 | Backend DAL & Auth Client |
| **Tailwind CSS** | 4.0.0 via `@tailwindcss/vite` | Styling lilac/dark purple gloss utuh |
| **TypeScript** | 5.7.3 | `tsc --noEmit` 0 error |

---

## 3. Temuan Investigasi Alur Autentikasi (Trace UI → Express → Supabase)

### A. Frontend Form Submission (`StaffLoginPortal.tsx`)
- Pengguna memasukkan `identifier` (dapat berupa username staf `ray` atau email staf seperti `rayhanafirzanx@gmail.com`) dan `password`.
- Form memanggil `login(identifier, password)` pada `AppContext.tsx`.
- **Temuan Cacat Tangkapan Error (Greedy Catch-All)**:
  Pada `StaffLoginPortal.tsx`, terdapat logika penangkapan error:
  ```typescript
  if (res.errorCode === 'MJ-AUTH-001' || errorMsg.includes('tidak cocok') || errorMsg.includes('salah')) { ... }
  ```
  Kondisi `errorMsg.includes('tidak cocok')` menangkap semua error termasuk `AUTH_UID_MISMATCH` ("Auth UID tidak cocok dengan profil staf"), konfigurasi Supabase yang belum siap, atau status mapping yang belum disetujui, lalu secara keliru membungkusnya ke dalam modal generik `MJ-AUTH-001`.

### B. Frontend Auth Context (`src/context/AppContext.tsx`)
- Method `login()` mengirim request `POST /api/auth/supabase-login` dengan payload `{ identifier, password }`.
- **Temuan Cacat Response Parsing**:
  Jika backend merespons dengan HTTP status 400, 401, atau 500, `AppContext.tsx` langsung memetakan pesan default:
  ```typescript
  return { success: false, error: 'Autentikasi gagal. Kredensial tidak cocok.', errorCode: 'MJ-AUTH-001' };
  ```
  Hal ini menutupi penyebab kegagalan sebenarnya dari Supabase Auth (seperti `NEEDS_MAPPING`, `STAFF_AUTH_EMAIL_MISSING`, atau `AUTH_UID_MISMATCH`).

### C. Backend Endpoint (`POST /api/auth/supabase-login` di `server.ts`)
- Memanggil `signInWithSupabaseAuth({ identifier, password, ipAddress, userAgent })`.
- **Temuan Cacat HTTP Status Mapping**:
  Sebelumnya, kesalahan pemetaan akun (`NEEDS_MAPPING`) dan kesalahan peran staf mengembalikan status HTTP yang tidak konsisten dengan spesifikasi REST, dan tidak menyertakan payload `details` (seperti `staffId` untuk asistensi approval).

### D. Supabase Auth Adapter (`server/supabaseAuthAdapter.ts`)
- **Akar Masalah #1: Overwrite Email Input Pengguna**:
  Pada baris awal `signInWithSupabaseAuth`, adapter mengambil profil staf dari database menggunakan `findUserInSupabaseDetailed(identifier)`.
  Ketika pengguna login menggunakan email alternatifnya (`rayhanafirzanx@gmail.com` milik akun Super Admin `u-ray`), database menemukan record staf tersebut dengan profil:
  - `email`: `rayjs666@gmail.com`
  - `altEmail`: `rayhanafirzanx@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com`
  Adapter lama melakukan:
  ```typescript
  const authEmail = String(authoritativeUser.email || authoritativeUser.altEmail || '').trim().toLowerCase();
  targetEmail = authEmail; // Selalu di-overwrite ke rayjs666@gmail.com!
  ```
  Sehingga meskipun pengguna mengetik `rayhanafirzanx@gmail.com`, adapter selalu memaksakan email `rayjs666@gmail.com` ke Supabase Auth `signInWithPassword`. Jika akun Supabase Auth pengguna didaftarkan dengan `rayhanafirzanx@gmail.com`, Supabase Auth menolak kredensial tersebut dengan pesan `Invalid login credentials`!
- **Akar Masalah #2: Tidak Ada Multi-Email Candidate Fallback Loop**:
  Ketika pengguna memasukkan username (`ray`), adapter hanya mencoba `authoritativeUser.email`. Jika akun di Supabase Auth terdaftar dengan salah satu email pada `altEmail`, login langsung gagal tanpa mencoba kandidat email sah lainnya.

### E. Database DAL (`server/supabaseAdapter.ts`)
- **Akar Masalah #3: PostgREST `.ilike` pada String CSV**:
  Pada `findUserInSupabaseDetailed`, pencarian kolom `alt_email` sebelumnya menggunakan:
  ```typescript
  client.from('users').select('*').ilike('alt_email', raw);
  ```
  Karena `alt_email` menyimpan string CSV (`"rayhanafirzanx@gmail.com, superadmin@morajaws.net"`), query kesamaan eksak tanpa wildcard `%` selalu mengembalikan 0 baris saat pengguna mencari salah satu email dari daftar tersebut.

---

## 4. Evaluasi Integritas Data & Proteksi Record
- Tiga Work Order terproteksi (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) diaudit:
  - Dipastikan tetap soft-deleted dan tidak pernah dimutasi/dihapus hard delete.
  - Guard server pada `/api/tickets/assign`, `/api/tickets/reassign`, dan Supabase proxy tetap menolak mutasi dengan kode `PROTECTED_PRODUCTION_RECORD`.
- Local JSON database (`data/morajaws_database.json`) tetap terisolasi dan tidak disinkronkan ke remote produksi secara sepihak.
