-- Check what RLS policies actually exist on the grades table
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'grades';
