# MORAJAWS0 — PHASE 15A.1 SCHEMA & RLS ARCHITECTURAL REVIEW
**Document ID**: MORAJAWS-RLS-PHASE15A1-004  
**Target Migration**: `migrations/005_add_auth_user_id_to_users.sql` (DRAFT ONLY)  
**Status**: REVIEWED & SECURED (NOT EXECUTED ON REMOTE)  
**Date**: November 2026  

---

## 1. Executive Summary

Laporan ini menyajikan tinjauan arsitektur mendalam terhadap rancangan migrasi database **Migration 005**: `migrations/005_add_auth_user_id_to_users.sql`.

Rancangan awal migrasi memiliki kelemahan kritis berupa **Recursive RLS Policy** pada tabel `public.users`, yang jika dieksekusi di PostgreSQL akan memicu kegagalan sistem (*SQLSTATE 42P17: infinite recursion detected in policy for relation "users"*).

Pada Phase 15A.1, rancangan DRAFT migrasi ini telah direvisi secara komprehensif menggunakan pola **`SECURITY DEFINER` function**, indeks unik parsial, dan batasan hak akses yang aman.

> **PERINGATAN KESELAMATAN ARSITEKTUR**:  
> Migration 005 adalah dokumen **PROPOSAL DRAFT**. File ini **TIDAK DIJALANKAN** dan **TIDAK BOLEH DIJALANKAN** ke database Supabase remote tanpa persetujuan tertulis eksplisit dari pemilik sistem (*Owner Approval Gate*).

---

## 2. Masalah Kritis: Recursive RLS Policy pada PostgreSQL

### 2.1 Anatomi Masalah (Pola Naif yang Rusak)
Pada rancangan RLS sederhana, pengembang sering kali menulis policy seperti berikut:
```sql
-- POLA CACAT (JANGAN DIGUNAKAN - MENYEBABKAN REKURSI TANPA AKHIR):
CREATE POLICY users_super_admin_all ON public.users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );
```

### 2.2 Mengapa Terjadi Infinite Recursion?
1. Saat pengguna dengan token `authenticated` melakukan `SELECT * FROM public.users`, PostgreSQL mengevaluasi policy `users_super_admin_all`.
2. Untuk mengevaluasi policy tersebut, PostgreSQL harus menjalankan subquery: `SELECT 1 FROM public.users WHERE ...`.
3. Karena subquery tersebut membaca tabel `public.users`, PostgreSQL **kembali memanggil** policy RLS pada tabel `public.users`.
4. Pemanggilan berulang ini terjadi tanpa henti hingga PostgreSQL menghentikan query dengan pesan error fatal:
   `ERROR: infinite recursion detected in policy for relation "users" (SQLSTATE 42P17)`.
5. Akibatnya, seluruh query ke tabel pengguna gagal total (Denial of Service).

---

## 3. Solusi Arsitektural: `SECURITY DEFINER` Helper Function

Untuk mengatasi rekursi secara elegan dan aman, Migration 005 mengadopsi pola standar PostgreSQL enterprise:

### 3.1 Fungsi `public.get_auth_user_role()`
```sql
CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_auth_uid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.users 
  WHERE auth_user_id = p_auth_uid 
    AND is_active = true 
    AND deleted_at IS NULL 
  LIMIT 1;
$$;
```

### 3.2 Mengapa Solusi Ini Aman dan Bebas Rekursi?
1. **Bypass RLS Terisolasi**: Klausa `SECURITY DEFINER` mengeksekusi fungsi di bawah hak akses pemilik fungsi (database owner/postgres), sehingga pembacaan tabel `public.users` di dalam fungsi **tidak memicu evaluasi RLS**.
2. **Search Path Hardening**: Menetapkan `SET search_path = public, pg_temp` mencegah eksploitasi substitusi skema (Search Path Hijacking).
3. **Optimasi Performa**: Deklarasi `STABLE` memungkinkan query planner PostgreSQL melakukan caching terhadap hasil fungsi selama siklus transaksi query yang sama.

---

## 4. Rincian Komponen Draft Migration 005

### 4.1 Kolom `auth_user_id`
```sql
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auth_user_id UUID;
```
- Tipe data `UUID` sesuai dengan tipe primary key `auth.users(id)`.
- Bersifat `NULLABLE` agar akun staf existing tidak rusak sebelum dipetakan secara resmi.

### 4.2 Foreign Key Constraint
```sql
ALTER TABLE public.users
ADD CONSTRAINT fk_users_auth_user_id
FOREIGN KEY (auth_user_id) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;
```
- Jika akun Supabase Auth dihapus di masa depan, profil operasional MoraJaws tidak terhapus (tetap aman dengan `SET NULL`), menjaga integritas riwayat tiket WO.

### 4.3 Unique Partial Index (Invarian 1:1)
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique 
ON public.users (auth_user_id) 
WHERE auth_user_id IS NOT NULL;
```
- Menjamin satu `auth.users.id` hanya dapat terhubung ke tepat satu `public.users.id`.
- Kondisi `WHERE auth_user_id IS NOT NULL` mengizinkan banyak baris profil staf yang belum dipetakan tetap memiliki nilai `NULL` tanpa melanggar constraint unik.

### 4.4 Proposal Query Backfill (Terkontrol & Idempoten)
Draft migrasi menyertakan template query backfill yang hanya mengaitkan profil jika terdapat kecocokan email yang pasti:
```sql
-- DRAFT PROPOSAL BACKFILL (HANYA CONTOH, BUTUH APPROVAL OWNER):
UPDATE public.users u
SET auth_user_id = au.id,
    updated_at = NOW()
FROM auth.users au
WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(au.email))
  AND u.auth_user_id IS NULL
  AND u.deleted_at IS NULL
  AND u.is_active = true;
```

---

## 5. Model Hak Akses & Kebijakan RLS

Sesuai arsitektur target MoraJaws:
- **Express Backend**: Terhubung menggunakan `service_role` key. Peran ini memiliki hak istimewa (*RLS bypass*) untuk mengelola data operasional secara tersentralisasi.
- **Client Frontend**: Tidak memanggil Supabase secara langsung; seluruh panggilan melewati Express API.
- **Kebijakan RLS Authenticated** (sebagai pertahanan lapis ganda / defense-in-depth):
  1. Pengguna hanya dapat membaca profil dirinya sendiri:
     ```sql
     USING (auth_user_id = auth.uid())
     ```
  2. Super Admin dapat membaca seluruh profil menggunakan helper function non-rekursif:
     ```sql
     USING (public.get_auth_user_role(auth.uid()) = 'super_admin')
     ```

---

## 6. Status Kepatuhan Regulasi Database

- [x] **Zero DDL Execution**: Tidak ada query DDL/ALTER TABLE yang dieksekusi ke Supabase production pada fase ini.
- [x] **Zero Data Seeding**: Tidak ada akun atau data buatan yang dimasukkan ke database remote.
- [x] **Zero Recursive Danger**: Draft SQL telah diverifikasi bebas dari rekursi tak terbatas.
- [x] **Preservasi 3 Rekor WO Terproteksi**: Status 3 rekor soft-deleted terlindungi 100%.
