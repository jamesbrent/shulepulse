-- ─────────────────────────────────────────────────────────────────────────────
-- Enforce parent "Portal Access": a parent may sign in to the parent portal
-- only while at least one of their active linked students has a guardian record
-- (students.guardians JSONB) whose email matches them and whose portal_access is
-- true. Revoking portal_access therefore revokes the parent's portal login.
--
-- Model:
--   * parents link to children via students.parent_id = profiles.id
--   * each student carries a guardians JSONB array, e.g.
--       [{"name":"..","email":"..","relationship":"father","portal_access":true, ...}]
--   * a guardian grants access only to the parent whose profile.email equals the
--     guardian (or student.parent_email) email — so one guardian cannot grant a
--     different guardian's portal the same access.
--
-- SECURITY DEFINER (bypasses RLS so it can read the caller's own children even
-- under the parent/student isolation guard). Safe: it only inspects students
-- where parent_id = auth.uid().
--
-- Append-only; run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_portal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_hit   boolean := false;
  v_row   record;
BEGIN
  -- Only the caller may check their own portal access.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;

  FOR v_row IN
    SELECT s.guardians, s.parent_email
    FROM public.students s
    WHERE s.parent_id = p_user_id
      AND s.status = 'active'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_row.guardians, '[]'::jsonb)) AS g
      WHERE lower(g->>'email') IN (
              lower(v_email),
              lower(COALESCE(v_row.parent_email, ''))
            )
        AND COALESCE((g->>'portal_access')::boolean, false)
    ) THEN
      v_hit := true;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_hit;
END;
$$;

REVOKE ALL ON FUNCTION public.has_portal_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_portal_access(uuid) TO authenticated;
