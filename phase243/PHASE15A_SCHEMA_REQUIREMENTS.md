# MORAJAWS — PHASE 15A: SCHEMA REQUIREMENTS & MIGRATION PROPOSAL
**Analisis Skema Database, Desain Kolom Auth User ID, & Rencana Migrasi 005**  
**Tanggal**: 7 November 2026  
**Status**: DRAFT USULAN (TIDAK DIJALANKAN KE DATABASE PRODUKSI TANPA PERSETUJUAN PEMILIK)

---

## 1. Analisis Skema Aktual Saat Ini (`public.users`)

Berdasarkan inspeksi terhadap file migrasi existing:
- `migrations/001_core_morajaws_schema.sql`
- `migrations/002_schema_corrections.sql`
- `migrations/003_system_error_logs_and_corrections.sql`
- `migrations/004_security_hardening_and_schema_preparation.sql`

Tabel `public.users` saat ini memiliki struktur kolom utama:
- `id` (VARCHAR(64) PRIMARY KEY, format: `u-xxx` atau UUID)
- `name` (VARCHAR(255))
- `username` (VARCHAR(100) UNIQUE)
- `email` (VARCHAR(255) UNIQUE)
- `alt_email` (VARCHAR(255))
- `phone` (VARCHAR(50))
- `role` (VARCHAR(50))
- `contractor` (VARCHAR(255))
- `contractor_id` (VARCHAR(64))
- `area` (VARCHAR(100))
- `active` (BOOLEAN DEFAULT TRUE)
- `password_hash` (TEXT)
- `firebase_uid` (VARCHAR(128))
- `is_deleted` (BOOLEAN DEFAULT FALSE)
- `payload` (JSONB DEFAULT '{}'::jsonb)
- `session_version` (INTEGER DEFAULT 1)

### Temuan Arsitektur:
1. Kolom eksplisit `auth_user_id` bertipe `UUID` yang mereferensikan `auth.users(id)` **belum didefinisikan sebagai kolom fisik** pada skema tabel `public.users` di database remote saat ini.
2. Di Phase 15A, aplikasi menjembatani mapping ini secara aman tanpa melanggar aturan skema melalui:
   - Kolom `payload->>'authUserId'` yang disimpan dalam JSONB; dan
   - Dukungan mapping otomatis di `server/supabaseAdapter.ts` yang membaca `row.auth_user_id || payload.authUserId`.
3. Untuk standarisasi jangka panjang dan penegakan *foreign key constraint* langsung ke Supabase Auth (`auth.users`), diperlukan migrasi skema terstruktur (`005_add_auth_user_id_to_users.sql`).

---

## 2. Usulan DDL Migrasi 005 (`005_add_auth_user_id_to_users.sql`)

Berikut adalah draf DDL yang dirancang untuk diterapkan setelah persetujuan pemilik sistem:

```sql
-- =============================================================================
-- MORAJAWS MIGRATION 005: ADD AUTH_USER_ID TO PUBLIC.USERS
-- Description: Menghubungkan profil staff di public.users secara fisik
--              dengan Supabase Auth (auth.users) via Foreign Key & Index Unik.
-- Status: DRAFT PROPOSAL - Belum dieksekusi ke produksi.
-- =============================================================================

BEGIN;

-- 1. Tambahkan kolom auth_user_id jika belum ada
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- 2. Tambahkan Foreign Key constraint ke auth.users(id) dengan ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_users_auth_user_id'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT fk_users_auth_user_id
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Backfill nilai auth_user_id dari payload JSONB jika tersedia
UPDATE public.users
SET auth_user_id = (payload->>'authUserId')::UUID
WHERE auth_user_id IS NULL 
  AND payload->>'authUserId' IS NOT NULL
  AND payload->>'authUserId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 4. Buat Unique Partial Index untuk mencegah Auth UID ganda (hanya pada record non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
ON public.users (auth_user_id)
WHERE auth_user_id IS NOT NULL AND is_deleted = false;

-- 5. Buat B-Tree Index untuk lookup cepat saat resolusi login
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
ON public.users (auth_user_id);

-- 6. Verifikasi RLS (Row Level Security)
-- Pastikan user hanya dapat membaca data yang sesuai dengan hak aksesnya
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' AND policyname = 'users_read_policy_auth'
  ) THEN
    CREATE POLICY users_read_policy_auth ON public.users
    FOR SELECT
    USING (
      auth.uid() = auth_user_id 
      OR EXISTS (
        SELECT 1 FROM public.users u 
        WHERE u.auth_user_id = auth.uid() 
          AND u.role IN ('super_admin', 'dispatch', 'management_data', 'it_support')
      )
    );
  END IF;
END $$;

COMMIT;
```

---

## 3. Strategi Indexing & Performa Lookup

| Nama Index | Tipe | Kolom Target | Rationale Teknis |
| :--- | :---: | :--- | :--- |
| `idx_users_auth_user_id` | B-Tree | `auth_user_id` | Mempercepat pencarian profil staff saat verifikasi token JWT Supabase (`client.auth.getUser`). Waktu lookup berkurang dari $O(N)$ menjadi $O(\log N)$. |
| `idx_users_auth_user_id_unique` | Unique Partial | `auth_user_id` (WHERE `is_deleted = false`) | Mencegah collision/duplikasi di mana satu Auth UID ditautkan ke lebih dari satu profil staff aktif. Mengizinkan akun soft-deleted menyimpan riwayat tanpa memblokir akun baru. |
| `idx_users_username_lower` | B-Tree | `LOWER(username)` | Mempercepat resolusi login staff via username di server Express. |
| `idx_users_email_lower` | B-Tree | `LOWER(email)` | Mempercepat resolusi login staff via email di server Express. |

---

## 4. Rencana Transisi Zero-Downtime Cutover (Fase Mendatang)

Apabila pemilik sistem menyetujui pelaksanaan migrasi produksi di masa mendatang, tahapan cutover zero-downtime adalah sebagai berikut:

1. **Persiapan (Pre-Migration)**:
   - Membuat snapshot backup database PostgreSQL Supabase dan Firestore backup.
   - Memastikan tidak ada antrean sinkronisasi yang tertunda.
2. **Eksekusi DDL Migration 005**:
   - Menjalankan penambahan kolom `auth_user_id` dan indeks unik. Operasi `ADD COLUMN IF NOT EXISTS` berjalan instan tanpa table lock berkepanjangan.
3. **Penyelarasan Akun Staff (Identity Mapping)**:
   - Skrip migrasi server-side akan memetakan email setiap akun staff ke akun GoTrue `auth.users`.
   - Mengisi `auth_user_id` dengan UID dari `auth.users`.
4. **Verifikasi & Rollback Plan**:
   - Uji login 1 akun dari masing-masing 6 role di lingkungan produksi.
   - Jika terjadi kendala, kolom `auth_user_id` bersifat non-destruktif dan aplikasi Express tetap dapat membaca mapping dari `payload->>'authUserId'`.
