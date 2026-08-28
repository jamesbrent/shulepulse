-- ============================================================================
-- 119_delete_user_rpc.sql
-- BUG FIX (QA audit Part 11): deleting a user (including another superadmin)
-- failed because raw profiles.delete() was blocked by ~40 FK references
-- (audit_logs.performed_by, grades.teacher_id, expenses.*, etc.) and left the
-- auth.users row behind.
--
-- Fix: SECURITY DEFINER delete_user(p_user_id) that
--   1. allows only superadmins (objection from the audit - preserved),
--   2. refuses to delete the account that is currently signed in (self-protect),
--   3. nulls-out every FK reference to the profile (dynamic, over pg_constraint)
--      so no other records are lost - only a non-nullable reference (e.g.
--      lesson_attendance.teacher_id) aborts with a clear message,
--   4. removes the profile, then auth identities, then the auth user.
--
-- No changes to RLS or existing schema - it simply makes deletion correct.
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  _rec RECORD;
BEGIN
  -- 1) authorization: superadmin only
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'forbidden: only superadmin may delete users'
      USING ERRCODE = '42501';
  END IF;

  -- 2) self-protection
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete the account you are currently signed in as. A second superadmin must delete it.'
      USING ERRCODE = '0A000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- 3) detach every FK reference to this profile (NO ACTION / RESTRICT only;
  --    CASCADE / SET NULL constraints already self-handle).
  FOR _rec IN
    SELECT
      tc.conrelid::regclass::text AS tbl,
      a.attname                   AS col,
      a.attnotnull                AS notnull
    FROM pg_constraint tc
    JOIN pg_attribute a
      ON a.attrelid = tc.conrelid
     AND a.attnum = ANY(tc.conkey)
    WHERE tc.contype = 'f'
      AND tc.confrelid = 'profiles'::regclass
      AND tc.confdeltype IN ('a', 'r')
  LOOP
    IF _rec.notnull THEN
      RAISE EXCEPTION 'Cannot delete user: referenced by %.% (non-nullable). Reassign that record first.',
        _rec.tbl, _rec.col USING ERRCODE = '23503';
    END IF;
    EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = $1', _rec.tbl, _rec.col, _rec.col)
      USING p_user_id;
  END LOOP;

  -- 4) correct delete order: profile -> auth identities -> auth user
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION delete_user(UUID) TO authenticated, service_role;