-- ============================================================
-- 077_remaining_security_fixes.sql
-- VULN-04, VULN-09, VULN-12, VULN-21, VULN-22
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- VULN-04: Revoke direct auth.users access from authenticated
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  REVOKE SELECT ON auth.users FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'REVOKE auth.users skipped: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-09: Server-side school switching RPC
-- Prevents direct profiles.school_id UPDATE from client
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION switch_school(
  p_user_id UUID,
  p_school_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_user_id AND get_my_role() != 'superadmin' THEN
    RAISE EXCEPTION 'Cannot switch school for another user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND (
      school_id = p_school_id
      OR id = auth.uid()
      OR get_my_role() = 'superadmin'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid school selection';
  END IF;

  UPDATE profiles SET school_id = p_school_id WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION switch_school FROM PUBLIC;
GRANT EXECUTE ON FUNCTION switch_school TO authenticated;

-- ──────────────────────────────────────────────────────────
-- VULN-12: Add SET search_path to SECURITY DEFINER functions
-- ──────────────────────────────────────────────────────────

-- 004: promote_students(p_school_id UUID, p_student_ids UUID[], p_promoted_by UUID)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'promote_students') THEN
    ALTER FUNCTION promote_students(UUID, UUID[], UUID) SET search_path = public;
  END IF;
END $$;

-- 068: get_my_school_id() and get_my_role()
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_school_id') THEN
    ALTER FUNCTION get_my_school_id() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_role') THEN
    ALTER FUNCTION get_my_role() SET search_path = public;
  END IF;
END $$;

-- 070: _patch_rls_add_superadmin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_patch_rls_add_superadmin') THEN
    ALTER FUNCTION _patch_rls_add_superadmin(text, text, text, text) SET search_path = public;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-21: Audit RLS policies for auth.jwt() usage
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual::text AS using_expr
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual::text LIKE '%auth.jwt%' OR with_check::text LIKE '%auth.jwt%')
  LOOP
    RAISE WARNING 'VULN-21: Policy %.%.% still uses auth.jwt()', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-22: CHECK constraints on journal_entry_lines
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'journal_entry_lines') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'jel_non_negative_debit'
      AND conrelid = 'journal_entry_lines'::regclass
    ) THEN
      ALTER TABLE journal_entry_lines
        ADD CONSTRAINT jel_non_negative_debit CHECK (debit >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'jel_non_negative_credit'
      AND conrelid = 'journal_entry_lines'::regclass
    ) THEN
      ALTER TABLE journal_entry_lines
        ADD CONSTRAINT jel_non_negative_credit CHECK (credit >= 0);
    END IF;
  END IF;
END $$;
