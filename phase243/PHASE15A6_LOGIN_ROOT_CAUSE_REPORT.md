# MORAJAWS — PHASE 15A.6 LOGIN ROOT CAUSE REPORT
**Analisis Akar Penyebab Error**: `MJ-AUTH-001` (Kredensial Tidak Cocok)  
**Status**: DITEMUKAN, DIUJI & DIPERBAIKI SECARA PERMANEN  

---

## 1. Kronologi dan Gejala Masalah
Saat staf mencoba masuk melalui halaman Login MoraJaws (`StaffLoginPortal.tsx`):
1. Pengguna memasukkan username atau email yang valid beserta password.
2. Form menampilkan loading selama 1-2 detik.
3. Form memunculkan modal peringatan:
   - **Error Code**: `MJ-AUTH-001`
   - **Modul**: Authentication
   - **Operasi**: Staff Credential Login
   - **Pesan**: `Autentikasi gagal. Kredensial tidak cocok.`

---

## 2. Analisis Rantai Akar Masalah (Root Causes)

### Akar Masalah 1: Overwrite Email Input Pengguna oleh Adapter
Di dalam database MoraJaws (`data/morajaws_database.json` dan PostgreSQL Supabase tabel `users`), akun staf `u-ray` (Super Admin) memiliki data:
- `username`: `ray`
- `email`: `rayjs666@gmail.com`
- `altEmail`: `rayhanafirzanx@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com`

Ketika pengguna login mengetikkan:
- Identifier: `rayhanafirzanx@gmail.com`
- Password: (Password pengguna yang valid)

Alur pada `server/supabaseAuthAdapter.ts` sebelumnya mengeksekusi:
```typescript
const authoritativeUser = await findUserInSupabaseDetailed(identifier);
// ...
const authEmail = String(authoritativeUser.email || authoritativeUser.altEmail || '').trim().toLowerCase();
targetEmail = authEmail; // <--- BUG!
```
Karena `authoritativeUser.email` bernilai `"rayjs666@gmail.com"`, adapter selalu mengesampingkan email yang dimasukkan pengguna (`rayhanafirzanx@gmail.com`) dan menggantinya dengan `rayjs666@gmail.com`.
Akibatnya: Supabase Auth dipanggil dengan email `rayjs666@gmail.com` dan password pengguna. Jika kredensial akun Supabase Auth pengguna didaftarkan dengan `rayhanafirzanx@gmail.com`, Supabase Auth menolak login dengan error `Invalid login credentials`.

### Akar Masalah 2: Ketiadaan Multi-Email Candidate Fallback
Jika pengguna login menggunakan username (`ray`), adapter sebelumnya hanya mengambil `authoritativeUser.email`. Pada arsitektur migrasi staf, staf mungkin telah mendaftarkan salah satu dari alamat email sekundernya (`altEmail`). Adapter lama tidak memiliki mekanisme iterasi fallback untuk mencoba seluruh kandidat email resmi milik profil staf tersebut.

### Akar Masalah 3: Kegagalan Query PostgREST untuk Kolom `alt_email`
Pada `server/supabaseAdapter.ts`, pencarian pengguna di database Supabase menggunakan:
```typescript
client.from('users').select('*').ilike('alt_email', raw);
```
Kolom `alt_email` berisi daftar teks dipisahkan koma. Operator `.ilike('alt_email', raw)` hanya berhasil jika nilai kolom sama persis 100% dengan input tanpa koma. Untuk mengatasi ini, adapter harus menggunakan wildcard `.ilike('alt_email', `%${raw}%`)` dan kemudian memverifikasi kesamaan token secara presisi.

### Akar Masalah 4: Masking Error di UI Frontend (`StaffLoginPortal.tsx` & `AppContext.tsx`)
Di frontend:
1. `AppContext.tsx` menyamaratakan kegagalan login non-200 menjadi `MJ-AUTH-001`.
2. `StaffLoginPortal.tsx` memiliki kondisi greedy:
   `if (res.errorCode === 'MJ-AUTH-001' || errorMsg.includes('tidak cocok') || errorMsg.includes('salah'))`
   Setiap pesan error dari server yang mengandung kata `"tidak cocok"` (seperti `AUTH_UID_MISMATCH`: `"Auth UID tidak cocok dengan profil staf"`) dipaksa menjadi error `MJ-AUTH-001`.
   Hal ini membuat masalah konfigurasi, masalah pemetaan UID, dan email yang belum dikonfirmasi tampak seolah-olah pengguna salah memasukkan password.

---

## 3. Solusi dan Perbaikan Kode yang Diterapkan

### 1. Perbaikan Prioritas Email Input & Multi-Email Fallback
Di `server/supabaseAuthAdapter.ts`:
- Jika pengguna memasukkan email (`@`), sistem memeriksa apakah email tersebut cocok dengan `primary email` atau salah satu token di `altEmail`. Jika cocok, email input pengguna diprioritaskan langsung sebagai target Supabase Auth.
- Jika pengguna memasukkan username, adapter mengumpulkan daftar kandidat email sah (`[primary email, ...altEmails]`) dan melakukan loop fallback ke Supabase Auth secara transparan.
- Memastikan tidak pernah mengirim string CSV mentah ke Supabase Auth.

### 2. Perbaikan Query PostgREST `alt_email`
Di `server/supabaseAdapter.ts`:
- Menggunakan query wildcard `.ilike('alt_email', `%${raw}%`)`.
- Memvalidasi elemen CSV yang terpisah koma secara presisi sehingga token email yang dicocokkan adalah identik.
- Menambahkan fallback pencarian melalui `auth_user_id` untuk lookup berbasis UUID Supabase Auth.

### 3. Pemisahan Kode Error Spesifik dan UI Feedback
Di `src/context/AppContext.tsx` dan `src/components/auth/StaffLoginPortal.tsx`:
- Mempertahankan kode error asli dari backend: `NEEDS_MAPPING`, `AUTH_UID_MISMATCH`, `STAFF_AUTH_EMAIL_MISSING`, `AUTH_EMAIL_NOT_CONFIRMED`, `ACCOUNT_DISABLED`, `SUPABASE_NOT_CONFIGURED`, `AUTH_PROVIDER_UNAVAILABLE`.
- Hanya memunculkan `MJ-AUTH-001` jika error memang murni disebabkan oleh kesalahan password / kredensial (`AUTH_INVALID_CREDENTIALS` / `auth/wrong-password`).
- Menampilkan pesan bantuan yang relevan untuk setiap jenis kegagalan agar Super Admin atau Staf mengetahui tindakan perbaikan yang tepat.
