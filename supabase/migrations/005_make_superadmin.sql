-- Make the initial superadmin
-- Run this in the Supabase SQL Editor AFTER creating the superadmin user
-- via the Supabase Dashboard > Authentication > Users
--
-- Steps:
-- 1. Create the superadmin user in Supabase Dashboard (Authentication > Users)
-- 2. Copy the user's UUID
-- 3. Replace '<SUPERADMIN_UUID>' and '<SUPERADMIN_EMAIL>' below
-- 4. Run this SQL

-- 1. Update profile role
UPDATE public.profiles
SET role = 'superadmin', school_id = NULL
WHERE id = '<SUPERADMIN_UUID>';

-- 2. Update auth user metadata
UPDATE auth.users
SET raw_user_meta_data = 
  jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"superadmin"'
  )
WHERE id = '<SUPERADMIN_UUID>';

-- 3. If profile doesn't exist yet, insert one
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  '<SUPERADMIN_UUID>',
  '<SUPERADMIN_EMAIL>',
  'Super Admin',
  'superadmin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = '<SUPERADMIN_UUID>'
);
