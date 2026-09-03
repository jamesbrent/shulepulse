-- U-series / isolation hardening: prevent parent & student roles from reading
-- whole-school data via the school-isolation policies.
--
-- WHY (confirmed via live audit - diagnostics_isolation_audit.sql):
--   1. Several student profiles carry a populated profiles.school_id.
--   2. Most school-isolation policies use the *plain* pattern
--        school_id = get_my_school_id() OR get_my_role() = 'superadmin'
--      which is NOT role-gated. Because RLS policies for the same command on a
--      table are OR'd together, any authenticated parent/student whose profile
--      has a school_id can SELECT the ENTIRE school's rows on those tables
--      (fee_payments, fee_assessments, student_ledger, attendance, students,
--      parents, salary_grades, and all the staff_select_* / *_school_isolation
--      finance & admin tables).
--   3. The narrowly-scoped policies added for parents/students (139, 144) --
--      students_self_read, students_parent_read, *_parent_read,
--      grades_student_read -- do NOT contain get_my_school_id(), so this
--      rewrite leaves them untouched and they keep working.
--
-- FIX: read every policy whose USING qualifier references get_my_school_id()
-- and append a guard that excludes the 'parent' and 'student' roles from the
-- whole-school branch. Superadmin (via its own branch) and every staff role
-- (admin/bursar/teacher/class_teacher/librarian/deputy_administrator) are
-- unaffected. Operation, target roles and WITH CHECK are preserved bit-for-bit.
-- Idempotent: policies already containing the guard are skipped.
--
-- Append-only; run in the Supabase SQL editor.

DO $$
DECLARE
  pol RECORD;
  cmd_text TEXT;
  new_using TEXT;
  role_list TEXT;
  target_roles TEXT;
  role_oid oid;
  i INTEGER;
  hardened INT := 0;
BEGIN
  FOR pol IN
    SELECT
      c.relname                                        AS tablename,
      p.polname                                        AS policyname,
      p.polcmd                                         AS cmd,
      p.polroles                                       AS roles,
      pg_get_expr(p.polqual, p.polrelid)               AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid)          AS check_expr
    FROM pg_policy p
    JOIN pg_class c   ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      -- only policies that grant school-scoped visibility
      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%get_my_school_id()%'
      -- idempotency: skip ones we already hardened
      AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%NOT IN (''parent''%'
    ORDER BY c.relname, p.polname
  LOOP
    -- command keyword
    cmd_text := CASE pol.cmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END;

    -- rebuild target roles exactly as they were
    role_list := NULL;
    IF pol.roles IS NOT NULL THEN
      FOREACH role_oid IN ARRAY pol.roles
      LOOP
        target_roles := CASE WHEN role_oid = 0
          THEN 'public'
          ELSE quote_ident((SELECT rolname FROM pg_roles WHERE oid = role_oid))
        END;
        role_list := COALESCE(role_list || ',', '') || target_roles;
      END LOOP;
    END IF;
    IF role_list IS NULL OR role_list = '' THEN
      role_list := 'public';
    END IF;

    -- append the parent/student exclusion to the whole-school qualifier
    new_using := '(' || pol.using_expr
              || ') AND (get_my_role() NOT IN (''parent'',''student''))';

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);

    IF pol.check_expr IS NOT NULL AND pol.check_expr <> '' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I AS PERMISSIVE FOR %s TO %s USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, cmd_text, role_list, new_using, pol.check_expr
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON %I AS PERMISSIVE FOR %s TO %s USING (%s)',
        pol.policyname, pol.tablename, cmd_text, role_list, new_using
      );
    END IF;

    hardened := hardened + 1;
    RAISE NOTICE 'hardened %.% (%s)', pol.tablename, pol.policyname, cmd_text;
  END LOOP;

  RAISE NOTICE 'Total policies hardened: %', hardened;
END $$;
