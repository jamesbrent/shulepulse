-- ============================================================================
-- 135_admission_number_sequences_rls.sql
-- SECURITY FIX (audit C2): admission_number_sequences had no RLS.
--
-- Problem: the table (created in 118) was never RLS-enabled and had no
-- policies, so any authenticated user could read every school's per-year
-- admission counters, and a direct client write could manipulate the
-- sequences for any school.
--
-- Fix:
--   * ENABLE ROW LEVEL SECURITY.
--   * Add a school-scoped SELECT policy (same house style used across the
--     schema: school_id = get_my_school_id() OR superadmin).
--   * Deliberately add NO client INSERT/UPDATE/DELETE policy. All writes to
--     this table happen through the SECURITY DEFINER allocator functions
--     (public.generate_student_admission_number / preview_...), which run
--     with definer privileges (RLS-bypassed) and are themselves guarded by
--     public.guard_school_access(p_school_id) since migration 124. With RLS
--     enabled and no write policy, a direct client write is denied by RLS.
-- ============================================================================

ALTER TABLE admission_number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_number_sequences_select ON admission_number_sequences;
CREATE POLICY "admission_number_sequences_select"
  ON admission_number_sequences
  FOR SELECT
  TO authenticated
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- No INSERT/UPDATE/DELETE policy on purpose: writes are reserved for the
-- SECURITY DEFINER sequence functions. With RLS enabled and no write policy,
-- PostgreSQL denies any direct client-side write to this table.
