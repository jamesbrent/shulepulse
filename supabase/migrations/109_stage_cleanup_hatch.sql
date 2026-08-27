-- ============================================================================
-- 109_stage_cleanup_hatch.sql
-- Cleanup: drop escape hatch functions and audit marker.
-- ============================================================================
DO $cleanup$ BEGIN
  -- Drop the functions (implicitly revokes all grants)
  DROP FUNCTION IF EXISTS public.exec_query(text);
  DROP FUNCTION IF EXISTS public.exec_sql(text);
  DROP TABLE IF EXISTS public.audit_hatch_marker;
END $cleanup$;
NOTIFY pgrst, 'reload schema';