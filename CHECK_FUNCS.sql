-- Check if helper functions exist
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name IN ('my_role', 'my_school_id')
  AND routine_schema = 'public';
