-- Make the initial superadmin
-- Run this in the Supabase SQL Editor AFTER creating the superadmin user
-- via the Supabase Dashboard > Authentication > Users
--
-- Steps:
-- 1. Create the superadmin user in Supabase Dashboard (Authentication > Users)
-- 2. Copy the user's UUID from auth.users
-- 3. Replace the placeholder values below with the real UUID and email
-- 4. Run this SQL

-- First, find your superadmin user:
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Then run with your actual values:
DO $$
DECLARE
  v_user_id UUID := 'PASTE_YOUR_UUID_HERE';  -- <-- REPLACE with your auth.users UUID
  v_email TEXT := 'PASTE_YOUR_EMAIL_HERE';    -- <-- REPLACE with your email
BEGIN
  -- 1. Update profile role
  UPDATE public.profiles
  SET role = 'superadmin', school_id = NULL
  WHERE id = v_user_id;

  -- 2. Update auth user metadata
  UPDATE auth.users
  SET raw_user_meta_data = 
    jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"superadmin"'
    )
  WHERE id = v_user_id;

  -- 3. If profile doesn't exist yet, insert one
  INSERT INTO public.profiles (id, email, full_name, role)
  SELECT v_user_id, v_email, 'Super Admin', 'superadmin'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id
  );
END $$;
