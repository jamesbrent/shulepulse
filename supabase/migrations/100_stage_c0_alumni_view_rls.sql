-- ============================================================================
-- 100_stage_c0_alumni_view_rls.sql
-- Stage C0: close the anonymous PII leak on public.alumni_overview.
--
-- The view projected students.* alumni rows (full_name, admission_number,
-- class, gender, school_id) to ANON because it had no security_invoker and
-- PG provides no row-level security on views -> PostgREST served it directly
-- to unauthenticated callers (verified: anon SELECT returned 3 rows).
--
-- Fix (PG 17 has no view RLS, so two-layer approach):
--   1. security_invoker = true            -> base students RLS applies to any
--      query through the view (anon denied entirely; staff see own school only)
--   2. re-CREATE the view with identical columns PLUS a gating predicate:
--          superadmin bypass  OR  (own school AND my_has_feature('students.alumni'))
--      This is the plan-as-ceiling entitlement gate at the view layer.
-- Safe to re-run (CREATE OR REPLACE VIEW).
-- ============================================================================

ALTER VIEW public.alumni_overview
  SET (security_invoker = true);

CREATE OR REPLACE VIEW public.alumni_overview
WITH (security_invoker = true) AS
 SELECT id,
    school_id,
    full_name,
    admission_number,
    class,
    stream,
    gender,
    exit_reason,
    exit_date,
    approved_by,
    conduct,
    certificate_generated,
    certificate_id,
    record_locked,
    updated_at,
    updated_by,
    entry_year,
    (EXTRACT(year FROM updated_at))::integer AS exit_year,
        CASE
            WHEN ((exit_date IS NULL) OR (exit_reason IS NULL) OR (approved_by IS NULL)) THEN true
            ELSE false
        END AS has_data_issues,
        CASE
            WHEN record_locked THEN 'locked'::text
            WHEN ((exit_date IS NULL) OR (exit_reason IS NULL) OR (approved_by IS NULL)) THEN 'issues'::text
            ELSE 'clean'::text
        END AS data_status
   FROM students s
  WHERE (status = ANY (ARRAY['alumni'::text, 'completed'::text, 'graduated'::text]))
    AND (
          get_my_role() = 'superadmin'
          OR (
               s.school_id = get_my_school_id()
               AND my_has_feature('students.alumni')
             )
        );