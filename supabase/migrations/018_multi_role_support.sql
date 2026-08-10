-- Add roles TEXT[] array column for multiple-role support
-- Backward-compatible: existing role column stays as the "primary" role

-- 1. Add the roles array column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. Backfill: set roles = ARRAY[role] for existing rows
UPDATE profiles SET roles = ARRAY[role] WHERE roles IS NULL OR roles = '{}';

-- 3. Drop old single-value check constraint on role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 4. Add new check constraint with all allowed roles (for the primary role column)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
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
  'parent'
));

-- 5. Update the handle_new_user trigger to also populate roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  new_role TEXT;
BEGIN
  new_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'teacher');

  INSERT INTO public.profiles (id, email, full_name, role, roles)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    new_role,
    ARRAY[new_role]
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;
