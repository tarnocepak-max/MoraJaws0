-- =============================================================================
-- MORAJAWS ROLLBACK SPECIFICATION & RECOVERY INVENTORY (PHASE 16A.2.1)
-- Target Database: Supabase PostgreSQL (Staging Project: lvytgqsvxntnvlohmrxi)
--
-- PERINGATAN KESELAMATAN ARSITEKTUR & INTEGRITAS DATA:
--   1. JANGAN JALANKAN SECARA OTOMATIS: Rollback ini membutuhkan persetujuan tertulis
--      dan eksplisit dari pemilik aplikasi sebelum dieksekusi.
--   2. BUKAN PEMULIHAN PENUH (NOT A FULL RESTORATION):
--      Rollback skrip ini TIDAK mengembalikan keadaan database persis 100% seperti
--      sebelum migrasi 007, karena:
--      - Kolom yang telah ditambahkan TIDAK boleh di-DROP (DROP COLUMN menghancurkan data permanen).
--      - Tabel yang telah dibuat TIDAK boleh di-DROP (DROP TABLE menghancurkan catatan operasional).
--      - Ekstensi pgcrypto tidak dicabut karena dapat dibutuhkan fungsi lain.
--   3. RISIKO KRITIS PENGHAPUSAN TRIGGER & POLICY:
--      - Menghapus trigger 'trg_protect_legacy_wo_mutation' dan 'fn_protect_legacy_soft_deleted_wo'
--        akan MENIADAKAN proteksi mutlak pada 3 work order legasi yang dilindungi:
--        'wo_1793825457141_u4bnht', 'wo_imp_1793825458959_4i4f1h', 'wo_imp_1793825458959_262dei'.
--      - Menghapus policy '%I_service_role_all' sementara RLS tetap aktif akan memutus
--        akses backend Express ke tabel jika koneksi tidak memakai atribut BYPASSRLS.
-- =============================================================================

-- =============================================================================
-- INVENTARISASI OBJEK & KLASIFIKASI KEMAMPUAN PEMULIHAN
-- =============================================================================
--
-- A. OBJEK YANG DAPAT DIPULIHKAN SECARA AMAN (REVERSIBLE OBJECTS):
--    1. Index Komposit Khusus yang dibuat pada Migrasi 007:
--       - public.idx_work_orders_appointment_calendar
--       - public.idx_work_orders_leader_scope
--       - public.idx_work_orders_installer_scope
--       - public.idx_users_auth_user_id_unique
--       - public.idx_app_settings_value_gin
--       - public.idx_audit_logs_entity_event
--    2. Policy RLS service_role pada 19 tabel (jika disetujui untuk di-reset).
--    3. Fungsi helper: public.get_auth_user_role(UUID).
--
-- B. OBJEK YANG TIDAK DAPAT DIPULIHKAN OTOMATIS (NON-REVERSIBLE / HIGH RISK):
--    1. Tabel Baru (19 tabel MoraJaws):
--       DILARANG mengeksekusi DROP TABLE karena akan memusnahkan data yang telah tersimpan.
--    2. Kolom Kompatibilitas yang ditambahkan:
--       DILARANG mengeksekusi ALTER TABLE DROP COLUMN (misal auth_user_id, session_version,
--       installer_id, work_sessions) karena penghapusan kolom bersifat destruktif permanen.
--    3. Trigger Proteksi 3 WO Legasi:
--       Pencabutan trigger ini berisiko tinggi dan melanggar aturan proyek MORAJAWS_PROJECT_RULES.md.
--    4. Hak Akses (REVOKE ALL FROM authenticated, anon):
--       Jika dikembalikan ke keadaan sebelum 007, role browser akan kembali memiliki akses
--       langsung yang menyalahi arsitektur Express-only.
--
-- C. POHON KETERGANTUNGAN OBJEK (DEPENDENCY HIERARCHY):
--    Triggers -> Trigger Functions -> RLS Policies -> Helper Functions -> Indexes -> Constraints -> Tables
--    (Penghapusan objek harus mengikuti urutan terbalik dari dependensinya).
-- =============================================================================

-- =============================================================================
-- LANGKAH PEMULIHAN MANUAL (CHECKLIST UNTUK DATABASE ADMINISTRATOR)
-- =============================================================================
--
-- Langkah 1: Evaluasi alasan rollback bersama pemilik aplikasi.
-- Langkah 2: Lakukan backup skema dan data saat ini sebelum menjalankan perubahan apa pun.
-- Langkah 3: Jika hanya ingin membatalkan index tambahan atau fungsi helper 007,
--            eksekusi blok transaksi bersyarat di bawah dengan v_owner_confirmed = true.
-- Langkah 4: JANGAN PERNAH menjalankan DROP TABLE atau DROP COLUMN secara serampangan.
-- Langkah 5: Verifikasi ulang integritas 3 WO legasi terlindungi setelah operasi selesai.
-- =============================================================================

DO $$
DECLARE
  -- GERBANG PENGAMAN EKSEKUSI ROLLBACK:
  -- Default: FALSE (Dry-run / Simulasi aman).
  v_owner_confirmed BOOLEAN := false;
  tbl text;
  tables text[] := ARRAY[
    'roles', 'contractors', 'coverage_areas', 'users', 'work_orders',
    'assignment_history', 'ticket_messages', 'technical_reports', 'wa_templates',
    'app_settings', 'user_preferences', 'session_config', 'user_sessions',
    'attachments', 'audit_logs', 'integration_configs', 'sync_history',
    'system_error_logs', 'report_categories'
  ];
BEGIN
  IF NOT v_owner_confirmed THEN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'MORAJAWS ROLLBACK GUARD: v_owner_confirmed = false.';
    RAISE NOTICE 'Rollback diblokir secara aman untuk mencegah perubahan tak terduga.';
    RAISE NOTICE 'Untuk menjalankan pencabutan objek non-destruktif 007, pemilik aplikasi';
    RAISE NOTICE 'harus menyetujui secara tertulis dan mengubah v_owner_confirmed := true.';
    RAISE NOTICE '====================================================================';
    RETURN;
  END IF;

  RAISE NOTICE 'Memulai pencabutan objek non-destruktif migrasi 007...';

  -- 1. Hapus Composite Indexes tambahan 007
  DROP INDEX IF EXISTS public.idx_work_orders_appointment_calendar;
  DROP INDEX IF EXISTS public.idx_work_orders_leader_scope;
  DROP INDEX IF EXISTS public.idx_work_orders_installer_scope;
  DROP INDEX IF EXISTS public.idx_app_settings_value_gin;
  DROP INDEX IF EXISTS public.idx_audit_logs_entity_event;
  DROP INDEX IF EXISTS public.idx_users_auth_user_id_unique;
  RAISE NOTICE '[STEP 1/3 PASS] Index komposit tambahan berhasil dicabut.';

  -- 2. Hapus Helper Function get_auth_user_role jika tidak lagi digunakan
  DROP FUNCTION IF EXISTS public.get_auth_user_role(UUID);
  RAISE NOTICE '[STEP 2/3 PASS] Helper function get_auth_user_role berhasil dicabut.';

  -- 3. Hapus RLS Policies service_role 007 (CATATAN: RLS tetap aktif)
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', tbl, tbl);
  END LOOP;
  RAISE NOTICE '[STEP 3/3 PASS] Policy service_role 007 berhasil dicabut.';

  -- PERHATIAN: Trigger fn_protect_legacy_soft_deleted_wo TIDAK dicabut
  -- demi mempertahankan kepatuhan mutlak pada MORAJAWS_PROJECT_RULES.md.
  RAISE NOTICE 'Trigger mutlak 3 WO dilindungi TETAP DIPERTAHANKAN demi keamanan data.';
  RAISE NOTICE 'Rollback objek non-destruktif selesai.';
END $$;
