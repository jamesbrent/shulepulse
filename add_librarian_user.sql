-- ════════════════════════════════════════════════════════════════════════
--  ADD LIBRARIAN ROLE + GREENHILL LIBRARIAN USER
--  Run this in the Supabase SQL Editor.
--  - Adds 'librarian' to the allowed profiles role check
--  - Creates the auth login + profile for the Greenhill librarian
--    Email: library@greenhill.ac.ke
--    UUID:  e2b34af0-b379-44f8-91f4-37a14a411ea6
--  - Password is set to: 123@ShulePulse (change it on first login)
--  Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Allow the 'librarian' role in the profiles role check
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN (
  'superadmin',
  'admin',
  'deputy_administrator',
  'bursar',
  'registrar',
  'hod',
  'teacher',
  'class_teacher',
  'student',
  'parent',
  'librarian'
));

-- 2. Create the auth login for the librarian
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'e2b34af0-b379-44f8-91f4-37a14a411ea6',
  'authenticated', 'authenticated',
  'library@greenhill.ac.ke',
  crypt('123@ShulePulse', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('role', 'librarian', 'full_name', 'Librarian'),
  false, now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- 3. Create the profile linked to the Greenhill school
INSERT INTO public.profiles (id, email, full_name, role, roles, school_id)
SELECT
  'e2b34af0-b379-44f8-91f4-37a14a411ea6',
  'library@greenhill.ac.ke',
  'Librarian',
  'librarian',
  ARRAY['librarian'],
  id
FROM public.schools
WHERE name ILIKE '%greenhill%' OR email ILIKE '%greenhill%'
LIMIT 1
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    role = 'librarian',
    roles = ARRAY['librarian'],
    school_id = EXCLUDED.school_id;

-- 4. Sanity check
SELECT p.id, p.email, p.full_name, p.role, p.roles, s.name AS school
FROM public.profiles p
LEFT JOIN public.schools s ON s.id = p.school_id
WHERE p.id = 'e2b34af0-b379-44f8-91f4-37a14a411ea6';
