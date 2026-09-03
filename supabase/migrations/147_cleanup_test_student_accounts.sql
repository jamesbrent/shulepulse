-- ─────────────────────────────────────────────────────────────────────────────
-- Isolation cleanup: delete the 3 TEST student accounts + their student data.
--
-- Context (confirmed via live audit -- diagnostics_isolation_audit.sql &
-- diagnostics_test_student_footprint.sql): these three student-role accounts
-- are test/seed artifacts. Each has a profiles.school_id populated, which
-- combined with the (now-hardened) school-isolation policies was flagged as a
-- whole-school read risk. The user confirmed they are dummy accounts and asked
-- to delete them. This removes the accounts AND their linked student records
-- (fee_assessments, student_ledger, attendance, students row).
--
-- Safety: only touches rows whose email matches one of the three test
-- accounts. No other student/auth/profiles rows are affected. Idempotent.
-- Run in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_profile_ids uuid[];
  v_student_ids uuid[];
BEGIN
  -- 1. Collect the test profiles (email guard only, so we never grab real users)
  SELECT array_agg(p.id) INTO v_profile_ids
  FROM public.profiles p
  WHERE lower(p.email) IN (
          lower('james.omondi@student.greenhill.ac.ke'),
          lower('wayne.kimuchu@student.greenhill.ac.ke'),
          lower('wiayakiwanja@shulepulse.com')
        );

  IF v_profile_ids IS NULL OR array_length(v_profile_ids, 1) = 0 THEN
    RAISE NOTICE 'cleanup: no matching test student profiles to remove';
    RETURN;
  END IF;

  -- 2. Collect the matching students rows (matched by email, like the footprint)
  SELECT array_agg(s.id) INTO v_student_ids
  FROM public.students s
  WHERE lower(s.email) IN (
          lower('james.omondi@student.greenhill.ac.ke'),
          lower('wayne.kimuchu@student.greenhill.ac.ke'),
          lower('wiayakiwanja@shulepulse.com')
        );

  RAISE NOTICE 'cleanup: removing % student record(s) and % profile(s)',
    coalesce(array_length(v_student_ids,1),0),
    array_length(v_profile_ids,1);

  -- 3. Child rows tied to those student records (delete explicitly, dependency-first).
  --    All children with a NO ACTION delete rule must be cleared before the
  --    students row (per diagnostics_students_fk.sql): attendance, fee_payments,
  --    fees, grades, mpesa_transactions. The remaining children are CASCADE.
  IF v_student_ids IS NOT NULL THEN
    DELETE FROM public.attendance              WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.fee_payments            WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.fees                    WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.grades                  WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.mpesa_transactions      WHERE student_id = ANY(v_student_ids);
    -- CASCADE children resolve automatically when the row is removed
    DELETE FROM public.students                WHERE id = ANY(v_student_ids);
  END IF;

  -- 4. Auth layers: identities -> profiles -> auth.users (mirrors delete_user())
  DELETE FROM auth.identities WHERE user_id = ANY(v_profile_ids);
  DELETE FROM public.profiles  WHERE id       = ANY(v_profile_ids);
  DELETE FROM auth.users       WHERE id       = ANY(v_profile_ids);

  RAISE NOTICE 'cleanup: complete';
END;
$$;
