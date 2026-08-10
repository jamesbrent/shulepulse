-- Make jamesbrent562@gmail.com a superadmin
-- Run this in the Supabase SQL Editor

-- 1. Update profile role
UPDATE public.profiles
SET role = 'superadmin', school_id = NULL
WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13';

-- 2. Update auth user metadata
UPDATE auth.users
SET raw_user_meta_data = 
  jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"superadmin"'
  )
WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13';

-- 3. If profile doesn't exist yet, insert one
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13',
  'jamesbrent562@gmail.com',
  'James Brent',
  'superadmin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13'
);
