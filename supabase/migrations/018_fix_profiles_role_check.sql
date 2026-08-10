-- Fix profiles_role_check constraint to support all new roles
-- The existing constraint only allows a limited set of roles.
-- We drop the old constraint and recreate it with all roles.

ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check
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
