-- =============================================================================
-- MORAJAWS MIGRATION 005: ADD AUTH_USER_ID TO PUBLIC.USERS & NON-RECURSIVE RLS
-- Description: Menghubungkan profil staff di public.users secara fisik
--              dengan Supabase Auth (auth.users) via Foreign Key, Index Unik,
--              dan Desain RLS Non-Recursive yang Aman.
-- Status: DRAFT PROPOSAL - TIDAK DIJALANKAN KE DATABASE PRODUKSI TANPA PERSETUJUAN PEMILIK.
-- Target Database: Supabase PostgreSQL (Production Target)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. KOLOM FISIK auth_user_id
-- =============================================================================
-- Menambahkan kolom fisik bertipe UUID ke tabel public.users jika belum ada.
-- Menggunakan NULLABLE agar pembuatan akun staff pra-mapping tetap dapat dilakukan.
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.users.auth_user_id IS 
'Supabase Auth UID (auth.users.id) yang dipetakan secara resmi ke profil staf MoraJaws.';

-- =============================================================================
-- 2. FOREIGN KEY CONSTRAINT KE auth.users(id)
-- =============================================================================
-- Menghubungkan kolom auth_user_id ke tabel bawaan Supabase auth.users(id).
-- Menggunakan ON DELETE SET NULL agar penghapusan akun Auth tidak merusak riwayat profil staf.
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

-- =============================================================================
-- 3. UNIQUE PARTIAL INDEX (PENCEGAHAN DUPLIKASI IDENTITY)
-- =============================================================================
-- Memastikan 1 Auth UID hanya dapat terhubung ke tepat 1 akun staf aktif (1:1 mapping).
-- Akun soft-deleted (is_deleted = true) dikecualikan agar riwayat audit tetap ada tanpa memblokir re-mapping.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
ON public.users (auth_user_id)
WHERE auth_user_id IS NOT NULL AND is_deleted = false;

-- =============================================================================
-- 4. B-TREE LOOKUP INDEX UNTUK RESOLUSI LOGIN CEPAT
-- =============================================================================
-- Mempercepat pencarian profil staf saat verifikasi JWT Supabase (O(log N)).
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
ON public.users (auth_user_id);

-- =============================================================================
-- 5. BACKFILL DATA TERKONTROL DARI PAYLOAD JSONB
-- =============================================================================
-- Mengisi auth_user_id fisik dari payload->>'authUserId' hanya jika format UUID valid
-- dan belum terisi pada kolom fisik.
UPDATE public.users
SET auth_user_id = (payload->>'authUserId')::UUID
WHERE auth_user_id IS NULL 
  AND payload->>'authUserId' IS NOT NULL
  AND payload->>'authUserId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- =============================================================================
-- 6. SECURITY DEFINER HELPER FUNCTION (MENCEGAH RLS INFINITE RECURSION)
-- =============================================================================
-- MASALAH PADA DRAF SEBELUMNYA:
--   Policy: EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN (...))
--   Menyebabkan Infinite Recursion (SQLSTATE 42P17) karena subquery ke public.users
--   memicu kembali evaluasi RLS pada tabel public.users secara rekursif tak berujung.
--
-- SOLUSI:
--   Fungsi SECURITY DEFINER dengan search_path eksplisit yang membaca role pengguna
--   dengan hak akses pemilik fungsi (bypassing RLS saat evaluasi policy).
CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_auth_uid UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  IF p_auth_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE auth_user_id = p_auth_uid
    AND is_deleted = false
    AND active = true
  LIMIT 1;

  RETURN v_role;
END;
$$;

COMMENT ON FUNCTION public.get_auth_user_role(UUID) IS 
'Helper SECURITY DEFINER bebas-rekursi untuk memeriksa role staf berdasarkan auth.uid().';

-- =============================================================================
-- 7. DESAIN ROW LEVEL SECURITY (RLS) BEBAS REKURSI
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Cabut policy lama yang berpotensi rekursif jika ada
DROP POLICY IF EXISTS users_read_policy_auth ON public.users;
DROP POLICY IF EXISTS users_select_policy ON public.users;
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_select_privileged ON public.users;
DROP POLICY IF EXISTS users_service_role_all ON public.users;

-- 7.A. Hak Akses SERVICE ROLE (Express Backend)
-- Express backend terhubung via service_role key yang otomatis memiliki BYPASSRLS.
-- Policy eksplisit ini memastikan akses tak terhalang untuk operasi server authoritative.
CREATE POLICY users_service_role_all ON public.users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7.B. Hak Akses SELECT untuk Pengguna Biasa (Membaca Profil Sendiri)
-- Pengguna hanya dapat membaca baris profil mereka sendiri yang cocok dengan auth.uid().
-- Evaluasi langsung kolom (auth_user_id = auth.uid()) tanpa subquery menjamin Zero-Recursion.
CREATE POLICY users_select_own ON public.users
FOR SELECT
TO authenticated
USING (
  auth.uid() = auth_user_id
);

-- 7.C. Hak Akses SELECT untuk Role Berwenang (Super Admin, Dispatch, Management Data, IT Support)
-- Menggunakan fungsi SECURITY DEFINER public.get_auth_user_role(auth.uid()) sehingga
-- TIDAK MENIMBULKAN REKURSI PADA EVALUASI POLICY.
CREATE POLICY users_select_privileged ON public.users
FOR SELECT
TO authenticated
USING (
  public.get_auth_user_role(auth.uid()) IN ('super_admin', 'dispatch', 'management_data', 'it_support')
);

-- 7.D. Proteksi Mutasi (INSERT, UPDATE, DELETE)
-- Seluruh mutasi profil staf (termasuk role, contractor, sessionVersion, aktifasi)
-- HANYA dapat dilakukan oleh Express Backend (service_role) atau Super Admin.
-- Pengguna reguler diblokir mengubah kolom mereka sendiri untuk mencegah privilege escalation.
CREATE POLICY users_modify_superadmin_only ON public.users
FOR UPDATE
TO authenticated
USING (
  public.get_auth_user_role(auth.uid()) = 'super_admin'
)
WITH CHECK (
  public.get_auth_user_role(auth.uid()) = 'super_admin'
);

-- =============================================================================
-- 8. GRANT PERMISSIONS
-- =============================================================================
GRANT ALL ON TABLE public.users TO service_role;
GRANT SELECT ON TABLE public.users TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM authenticated;
GRANT UPDATE ON TABLE public.users TO authenticated; -- Dibatasi oleh policy users_modify_superadmin_only

COMMIT;
