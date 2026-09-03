-- ─────────────────────────────────────────────────────────────────────────────
-- U16: remove reliance on auth.users so the SELECT grant can be revoked
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 097 documented the intended follow-up: "rewrite parent policies to
-- use profiles.email so auth.users access can be revoked again later".
-- This migration:
--   1. keeps profiles.email in sync with auth.users.email (insert + update),
--   2. rewrites the 4 RLS policies that read auth.users to use profiles.email,
--   3. revokes the SELECT grant on auth.users from authenticated (LAST).

-- ── Onboarding migration 018 handle_new_user already populates profiles.email
--    at signup. The trigger below additionally keeps it in sync on email change
--    so profiles.email is always an accurate mirror for policies below.

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'sync_profile_email error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- ── 1. grades_parent_read (parents see approved/published grades) ───────────
DROP POLICY IF EXISTS grades_parent_read ON public.grades;
CREATE POLICY grades_parent_read
  ON public.grades
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['approved'::text, 'published'::text])
    AND school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      WHERE s.parent_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
        AND s.school_id = grades.school_id
    )
  );

-- ── 2. cbc_assessments_parent_read ──────────────────────────────────────────
DROP POLICY IF EXISTS cbc_assessments_parent_read ON public.cbc_assessments;
CREATE POLICY cbc_assessments_parent_read
  ON public.cbc_assessments
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      WHERE s.parent_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
        AND s.school_id = cbc_assessments.school_id
    )
  );

-- ── 3. students_self_read (students see their own row) ──────────────────────
DROP POLICY IF EXISTS students_self_read ON public.students;
CREATE POLICY students_self_read
  ON public.students
  FOR SELECT TO authenticated
  USING (
    email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ── 4. grades_student_read (students see their own grades) ──────────────────
DROP POLICY IF EXISTS grades_student_read ON public.grades;
CREATE POLICY grades_student_read
  ON public.grades
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['approved'::text, 'published'::text])
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      WHERE s.email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- ── LAST: revoke the SELECT grant on auth.users ─────────────────────────────
REVOKE SELECT ON auth.users FROM authenticated;
