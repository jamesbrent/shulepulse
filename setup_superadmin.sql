-- Run this in Supabase SQL Editor

UPDATE public.profiles SET role = 'superadmin', school_id = NULL WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13';

UPDATE auth.users SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"superadmin"') WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13';

INSERT INTO public.profiles (id, email, full_name, role) SELECT '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13', 'jamesbrent562@gmail.com', 'Super Admin', 'superadmin' WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '85691ab5-c834-4bd3-a7ea-e2b6aba4bf13');
