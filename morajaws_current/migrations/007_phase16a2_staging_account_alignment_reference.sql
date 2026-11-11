-- =============================================================================
-- MORAJAWS STAGING ACCOUNT ALIGNMENT & VERIFICATION SCRIPT (PHASE 16A.2.1 SAFEGUARDED)
-- Target: Supabase Staging Project: lvytgqsvxntnvlohmrxi (MoraJaws-Staging-Auth)
-- Target URL: https://lvytgqsvxntnvlohmrxi.supabase.co
--
-- TARGET STAGING AUTH ACCOUNT:
--   Email: rayhanafirzanx@gmail.com
--   Auth UID: a32628b2-25fb-48c3-934c-9d2d7eb58255
--   Provider: Supabase Auth (auth.users)
--
-- CRITICAL SAFETY RULES ENFORCED BY THIS SCRIPT:
--   1. READ-FIRST AUDIT: SELECT is executed first to inspect state without mutation.
--   2. NOT FOUND GUARD: If 0 matching profiles exist, halts with 'NOT FOUND'.
--      NEVER fabricates or auto-creates fake staff profiles.
--   3. AMBIGUOUS GUARD: If > 1 matching profiles exist, halts with 'AMBIGUOUS'.
--   4. CONFLICT GUARD (EXISTING UID): If the profile already has a different auth_user_id,
--      halts with 'CONFLICT'. NEVER overwrites an already-populated auth_user_id.
--   5. CONFLICT GUARD (UID REUSE): If target UID is already bound to another profile,
--      halts with 'CONFLICT' to prevent duplicate UID binding.
--   6. ROLE IMMUTABILITY: NEVER alters or assumes user roles (e.g. super_admin).
--   7. FIELD PRESERVATION: NEVER assumes or alters username, name, contractor, or area.
--   8. AUTH IMMUTABILITY: NEVER creates accounts in auth.users and NEVER modifies passwords.
--   9. OWNER CONFIRMATION GATE: By default, runs in DRY-RUN mode (v_owner_confirmed = false).
--      UPDATE is physically blocked unless the application owner explicitly sets v_owner_confirmed = true.
--  10. TRANSACTIONAL INTEGRITY: UPDATE is wrapped in a strict transaction verifying
--      exactly 1 row was updated before COMMIT.
-- =============================================================================

-- =============================================================================
-- BAGIAN 1: DIAGNOSTIK & VERIFIKASI PRA-ALIGNMENT (READ-ONLY)
-- Jalankan bagian ini terlebih dahulu untuk memeriksa kondisi awal tanpa mutasi.
-- =============================================================================

-- 1.1. Verifikasi keberadaan akun di auth.users (Supabase Auth)
SELECT 
  'auth.users' AS source_table,
  id AS auth_uid, 
  email AS auth_email, 
  email_confirmed_at, 
  created_at, 
  last_sign_in_at, 
  banned_until 
FROM auth.users
WHERE id = 'a32628b2-25fb-48c3-934c-9d2d7eb58255'::UUID
   OR email = 'rayhanafirzanx@gmail.com';

-- 1.2. Hitung jumlah profil staf di public.users yang cocok dengan email
SELECT 
  COUNT(*) AS matching_profile_count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'NOT_FOUND: Tidak ditemukan profil staf dengan email tersebut'
    WHEN COUNT(*) = 1 THEN 'ELIGIBLE: Tepat satu profil ditemukan'
    ELSE 'AMBIGUOUS: Lebih dari satu profil memiliki email tersebut'
  END AS audit_status
FROM public.users
WHERE (lower(btrim(email)) = lower('rayhanafirzanx@gmail.com') 
    OR lower(btrim(alt_email)) = lower('rayhanafirzanx@gmail.com'))
  AND is_deleted = false;

-- 1.3. Detail profil staf di public.users yang cocok (READ-ONLY)
SELECT 
  id AS staff_profile_id, 
  auth_user_id, 
  name, 
  username, 
  email, 
  alt_email, 
  role, 
  contractor, 
  area, 
  active, 
  is_deleted,
  CASE 
    WHEN auth_user_id IS NULL THEN 'UID_IS_NULL (Ready for alignment)'
    WHEN auth_user_id = 'a32628b2-25fb-48c3-934c-9d2d7eb58255'::UUID THEN 'ALREADY_ALIGNED (No update needed)'
    ELSE 'CONFLICT (Has different auth_user_id: ' || auth_user_id::text || ')'
  END AS uid_state
FROM public.users
WHERE (lower(btrim(email)) = lower('rayhanafirzanx@gmail.com') 
    OR lower(btrim(alt_email)) = lower('rayhanafirzanx@gmail.com'))
  AND is_deleted = false;

-- 1.4. Periksa apakah Auth UID target sudah terpakai oleh profil lain di public.users
SELECT 
  id AS existing_profile_id,
  username,
  email,
  role,
  auth_user_id,
  'CONFLICT: Auth UID ini sudah dipakai oleh profil lain!' AS warning
FROM public.users
WHERE auth_user_id = 'a32628b2-25fb-48c3-934c-9d2d7eb58255'::UUID
  AND is_deleted = false
  AND lower(btrim(email)) <> lower('rayhanafirzanx@gmail.com');


-- =============================================================================
-- BAGIAN 2: TRANSACTIONAL SAFE ALIGNMENT EXECUTION BLOCK
-- Blok PL/pgSQL ini menerapkan semua 10 batas keselamatan Phase 16A.2.1.
-- =============================================================================

DO $$
DECLARE
  v_target_email TEXT := 'rayhanafirzanx@gmail.com';
  v_target_auth_uid UUID := 'a32628b2-25fb-48c3-934c-9d2d7eb58255'::UUID;

  -- GERBANG PERSETUJUAN PEMILIK:
  -- Nilai default adalah FALSE (DRY-RUN). Hanya jika pemilik menyetujui, ubah menjadi TRUE.
  v_owner_confirmed BOOLEAN := false;

  v_auth_exists BOOLEAN := false;
  v_uid_conflict_count INTEGER := 0;
  v_matching_profile_count INTEGER := 0;
  v_candidate_record RECORD;
  v_rows_updated INTEGER := 0;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'MORAJAWS ALIGNMENT ENGINE: Memulai audit pra-pengaitan staf...';
  RAISE NOTICE 'Target Staging: lvytgqsvxntnvlohmrxi | Target Email: % | UID: %', v_target_email, v_target_auth_uid;
  RAISE NOTICE '====================================================================';

  -- 1. Verifikasi keberadaan akun di auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = v_target_auth_uid AND lower(btrim(email)) = lower(btrim(v_target_email))
  ) INTO v_auth_exists;

  IF NOT v_auth_exists THEN
    RAISE EXCEPTION 'HALT [AUTH_NOT_FOUND]: Akun Auth dengan UID % dan email % tidak ditemukan di auth.users. Pengaitan dibatalkan.', v_target_auth_uid, v_target_email;
  END IF;
  RAISE NOTICE '[CHECK 1/5 PASS] Akun Auth terverifikasi di auth.users.';

  -- 2. Periksa apakah target Auth UID sudah terikat ke profil staf lain di public.users
  SELECT COUNT(*) INTO v_uid_conflict_count
  FROM public.users
  WHERE auth_user_id = v_target_auth_uid
    AND is_deleted = false
    AND lower(btrim(email)) <> lower(btrim(v_target_email))
    AND (alt_email IS NULL OR lower(btrim(alt_email)) <> lower(btrim(v_target_email)));

  IF v_uid_conflict_count > 0 THEN
    RAISE EXCEPTION 'HALT [CONFLICT_UID_IN_USE]: Auth UID % sudah digunakan oleh % profil staf lain. Dilarang mengaitkan UID ganda.', v_target_auth_uid, v_uid_conflict_count;
  END IF;
  RAISE NOTICE '[CHECK 2/5 PASS] Auth UID belum terikat ke profil staf lain.';

  -- 3. Hitung jumlah profil staf di public.users yang cocok dengan email
  SELECT COUNT(*) INTO v_matching_profile_count
  FROM public.users
  WHERE (lower(btrim(email)) = lower(btrim(v_target_email)) 
      OR lower(btrim(alt_email)) = lower(btrim(v_target_email)))
    AND is_deleted = false;

  IF v_matching_profile_count = 0 THEN
    RAISE EXCEPTION 'HALT [NOT_FOUND]: Tidak ada profil staf di public.users yang cocok dengan email %. DILARANG membuat profil staf palsu.', v_target_email;
  ELSIF v_matching_profile_count > 1 THEN
    RAISE EXCEPTION 'HALT [AMBIGUOUS]: Ditemukan % profil staf dengan email %. Pengaitan dihentikan untuk mencegah salah sasaran.', v_matching_profile_count, v_target_email;
  END IF;
  RAISE NOTICE '[CHECK 3/5 PASS] Tepat satu profil staf cocok teridentifikasi (matching_count = 1).';

  -- 4. Ambil data kandidat profil staf
  SELECT id, username, email, alt_email, role, auth_user_id, contractor, area
  INTO v_candidate_record
  FROM public.users
  WHERE (lower(btrim(email)) = lower(btrim(v_target_email)) 
      OR lower(btrim(alt_email)) = lower(btrim(v_target_email)))
    AND is_deleted = false
  LIMIT 1;

  -- 5. Evaluasi status auth_user_id profil saat ini
  IF v_candidate_record.auth_user_id IS NOT NULL THEN
    IF v_candidate_record.auth_user_id = v_target_auth_uid THEN
      RAISE NOTICE '====================================================================';
      RAISE NOTICE '[ALREADY_ALIGNED]: Profil % (%) sudah terhubung ke UID %. Tidak ada update yang diperlukan.', v_candidate_record.username, v_candidate_record.id, v_target_auth_uid;
      RAISE NOTICE '====================================================================';
      RETURN;
    ELSE
      RAISE EXCEPTION 'HALT [CONFLICT_DIFFERENT_UID]: Profil % (%) sudah memiliki auth_user_id berbeda (%). DILARANG menimpa UID yang sudah ada.', 
        v_candidate_record.username, v_candidate_record.id, v_candidate_record.auth_user_id;
    END IF;
  END IF;
  RAISE NOTICE '[CHECK 4/5 PASS] auth_user_id profil kandidat saat ini masih NULL (siap dikaitkan).';

  -- 6. Verifikasi Gerbang Persetujuan Pemilik (Owner Confirmation Gate)
  IF NOT v_owner_confirmed THEN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE '[DRY_RUN_SUCCESS]: Semua syarat pengaitan terpenuhi 100%% untuk profil:';
    RAISE NOTICE '  - Profile ID : %', v_candidate_record.id;
    RAISE NOTICE '  - Username   : %', v_candidate_record.username;
    RAISE NOTICE '  - Role       : % (TIDAK AKAN DIUBAH)', v_candidate_record.role;
    RAISE NOTICE '  - Contractor : % (TIDAK AKAN DIUBAH)', v_candidate_record.contractor;
    RAISE NOTICE '  - Area       : % (TIDAK AKAN DIUBAH)', v_candidate_record.area;
    RAISE NOTICE '  - Target UID : %', v_target_auth_uid;
    RAISE NOTICE 'UPDATE BELUM DIEKSEKUSI karena v_owner_confirmed = false (Mode Simulasi Aman).';
    RAISE NOTICE 'Untuk mengeksekusi secara nyata, pemilik harus menyetujui dan mengubah v_owner_confirmed := true.';
    RAISE NOTICE '====================================================================';
    RETURN;
  END IF;

  -- 7. Eksekusi UPDATE dengan batas pengaman tunggal
  UPDATE public.users
  SET 
    auth_user_id = v_target_auth_uid,
    updated_at = now()
  WHERE id = v_candidate_record.id
    AND auth_user_id IS NULL
    AND is_deleted = false
    AND (lower(btrim(email)) = lower(btrim(v_target_email)) OR lower(btrim(alt_email)) = lower(btrim(v_target_email)));

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'HALT [INTEGRITY_VIOLATION]: Jumlah baris ter-update bukan 1 (actual: %). Transaksi dibatalkan.', v_rows_updated;
  END IF;

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '[UPDATE_SUCCESS]: Tepat 1 profil staf (%) berhasil dikaitkan ke Auth UID %.', v_candidate_record.username, v_target_auth_uid;
  RAISE NOTICE '====================================================================';
END $$;


-- =============================================================================
-- BAGIAN 3: VERIFIKASI PASCA-ALIGNMENT (READ-ONLY)
-- Memastikan integritas pengaitan 1:1 antara auth.users dan public.users.
-- =============================================================================

SELECT 
  u.id AS staff_profile_id,
  u.auth_user_id,
  au.id AS auth_users_id,
  au.email AS auth_email,
  u.email AS staff_email,
  u.username,
  u.role,
  u.contractor,
  u.area,
  u.active,
  u.is_deleted,
  (u.auth_user_id = au.id) AS is_correctly_linked_1to1
FROM public.users u
JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.auth_user_id = 'a32628b2-25fb-48c3-934c-9d2d7eb58255'::UUID;
