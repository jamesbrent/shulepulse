-- ════════════════════════════════════════════════════════════════════════
--  CREATE/RESET LOGINS FOR ALL GREENHILL USERS
--  Run this in the Supabase SQL Editor.
--  - Creates a login for every Greenhill profile missing one
--  - Resets the password of every user (existing or new) to: 123@ShulePulse
-- ════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS login_results (
  email text, full_name text, role text, status text, password text
);

DO $$
DECLARE
  school RECORD;
  p RECORD;
  uid uuid;
  pw text := '123@ShulePulse';
BEGIN
  SELECT * INTO school FROM public.schools
  WHERE name ILIKE '%greenhill%' OR email ILIKE '%greenhill%'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'Greenhill school not found by name — matching users by email domain instead.';
  END IF;

  FOR p IN
    SELECT id, email, full_name, role
    FROM public.profiles
    WHERE (school_id = school.id OR email ILIKE '%greenhill%')
    ORDER BY role, full_name
  LOOP
    IF p.email IS NULL OR p.email = '' THEN
      INSERT INTO login_results VALUES (NULL, p.full_name, p.role, 'SKIPPED (no email)', NULL);
      CONTINUE;
    END IF;

    SELECT id INTO uid FROM auth.users WHERE email = p.email LIMIT 1;

    IF uid IS NULL THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        p.id, 'authenticated', 'authenticated', p.email,
        crypt(pw, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('role', p.role, 'full_name', p.full_name),
        false, now(), now()
      );
      INSERT INTO login_results VALUES (p.email, p.full_name, p.role, 'LOGIN CREATED', pw);
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt(pw, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = uid;
      INSERT INTO login_results VALUES (p.email, p.full_name, p.role, 'PASSWORD RESET', pw);
    END IF;
  END LOOP;
END $$;

SELECT * FROM login_results ORDER BY role, full_name;
