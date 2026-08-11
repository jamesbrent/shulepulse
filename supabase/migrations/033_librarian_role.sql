-- ════════════════════════════════════════════════════════════════════════
-- 033_LIBRARIAN_ROLE
-- Allows admins to assign the 'librarian' role to staff members
-- (promote existing staff / add new librarian). The library module and
-- /library dashboard already support this role; only the profiles role
-- CHECK constraint excluded it.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

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
  'librarian',
  'student',
  'parent'
));
