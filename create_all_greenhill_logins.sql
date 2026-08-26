thi-- ════════════════════════════════════════════════════════════════════════
--  CREATE LOGINS FOR ALL GREENHILL USERS
--  Run this in the Supabase SQL Editor.
--  - Creates an auth login for every Greenhill profile missing one
--  - Does NOT change passwords of users who already have a login
--  - Default passwords: students = Student@123, staff/others = Staff@123
-- ════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS login_results (
  email text, full_name text, role text, status text, password text
);

DO $$
DECLARE
  school RECORD;
  p RECORD;
  uid uuid;
  pw text;
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

    IF p.role = 'student' THEN pw := 'Student@123'; ELSE pw := 'Staff@123'; END IF;

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
      INSERT INTO login_results VALUES (p.email, p.full_name, p.role, 'ALREADY HAS LOGIN (password unchanged)', NULL);
    END IF;
  END LOOP;
END $$;

SELECT * FROM login_results ORDER BY role, full_name;
