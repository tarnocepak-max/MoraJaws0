-- MoraJaws migration 007: provision the requested primary Superadmin account.
-- Apply after migrations 001-006 using the Supabase SQL editor or migration runner.
-- Password is stored as a PBKDF2 hash; the application upgrades it to bcrypt after successful login.
BEGIN;

DO $$
DECLARE
  v_user_id text;
  v_password_hash text := 'pbkdf2:sha256:310000:f53df92fa13b39f33eee3aaf263b0382:ae3de0d03c3ee7377cce06f04cd5fddab5bc0b7101c4b1b335b7758d9e2e2dc3';
BEGIN
  -- Prefer an existing exact email, then the requested username, then the legacy primary account.
  SELECT id INTO v_user_id
  FROM public.users
  WHERE lower(btrim(coalesce(email, ''))) = 'rayhanafirzanx@gmail.com'
     OR lower(btrim(coalesce(username, ''))) = 'rays'
     OR id = 'u-ray'
  ORDER BY CASE
    WHEN lower(btrim(coalesce(email, ''))) = 'rayhanafirzanx@gmail.com' THEN 1
    WHEN lower(btrim(coalesce(username, ''))) = 'rays' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := 'u-ray';
    INSERT INTO public.users (
      id, name, username, email, alt_email, role, active,
      must_change_password, permissions, is_deleted, password_hash, payload,
      created_at, updated_at
    ) VALUES (
      v_user_id, 'Ray (Super Admin)', 'rays', 'rayhanafirzanx@gmail.com',
      'rayjs666@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com',
      'super_admin', true, true, '[]'::jsonb, false, v_password_hash,
      jsonb_build_object('passwordHash', v_password_hash, 'sessionVersion', 2),
      now(), now()
    );
  ELSE
    UPDATE public.users
    SET name = 'Ray (Super Admin)',
        username = 'rays',
        email = 'rayhanafirzanx@gmail.com',
        alt_email = 'rayjs666@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com',
        role = 'super_admin',
        active = true,
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        must_change_password = true,
        password_hash = v_password_hash,
        session_version = COALESCE(session_version, 1) + 1,
        payload = COALESCE(payload, '{}'::jsonb)
          || jsonb_build_object('passwordHash', v_password_hash,
                                'sessionVersion', COALESCE(session_version, 1) + 1),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
END $$;

COMMIT;
