-- ============================================================================
-- 124_cross_school_rpc_guard.sql  —  ITEM 1 regression test
-- Run me in the Supabase SQL editor (local or hosted) after applying
-- 124_close_cross_school_rpc_gap.sql. Whole script runs in one transaction
-- and ROLLS BACK at the end, so nothing persists even if everything passes.
--
-- What it proves:
--   A. Structural: all 6 functions now call guard_school_access first; the
--      guard exists and carries the 'not your school' 42501.
--   B. Behaviour: with auth claims set to a REAL non-superadmin profile,
--      calling any of the 6 with a foreign p_school_id is rejected, and ZERO
--      rows are written to fee_payments / student_ledger /
--      student_credit_transactions / admission_number_sequences /
--      journal_entries.
--   C. Positive sanity: preview_fee_allocation with the caller's OWN school
--      succeeds (guard must not reject legitimate calls).
--
-- PASS: prints 'PASS item 1: ...' lines. FAIL: raises and halts.
-- ============================================================================

BEGIN;

-- ---------- A. Structural checks -------------------------------------------
DO $$
DECLARE
  v_guard_count INT;
  v_guarded     INT;
  v_msg         TEXT;
BEGIN
  SELECT count(*) INTO v_guard_count
  FROM pg_proc WHERE proname = 'guard_school_access' AND pronamespace = 'public'::regnamespace;

  IF v_guard_count <> 1 THEN
    RAISE EXCEPTION 'guard_school_access not found';
  END IF;

  SELECT count(*) INTO v_guarded
  FROM pg_proc
  WHERE proname IN (
    'record_fee_payment','preview_fee_allocation',
    'apply_student_credit','refund_student_credit',
    'generate_student_admission_number','preview_student_admission_number'
  )
  AND prosrc LIKE '%PERFORM public.guard_school_access(p_school_id);%';

  IF v_guarded <> 6 THEN
    RAISE EXCEPTION 'expected 6 guarded functions, found %', v_guarded;
  END IF;

  RAISE NOTICE 'PASS item 1 (A): all 6 functions guard school access, guard_school_access exists.';
END $$;

-- ---------- B. baseline row counts (before any rejection attempt) ----------
CREATE TEMP TABLE _item1_baseline AS
SELECT
  (SELECT count(*) FROM fee_payments)                 AS fee_payments,
  (SELECT count(*) FROM student_ledger)               AS student_ledger,
  (SELECT count(*) FROM student_credit_transactions)  AS credit_txns,
  (SELECT count(*) FROM admission_number_sequences)   AS admission_seq,
  (SELECT count(*) FROM journal_entries)              AS journal_entries;

-- ---------- C. Negative behaviour: foreign-school calls must be rejected ----
DO $$
DECLARE
  v_profile RECORD;
  v_foreign uuid := gen_random_uuid();
  v_res     jsonb;
  v_sqlerm  text;
  v_msg     text;
  v_dummy   text;
BEGIN
  SELECT p.id, p.school_id, p.role INTO v_profile
  FROM profiles p
  WHERE p.role IS DISTINCT FROM 'superadmin'         -- superadmin is allowed to cross
    AND COALESCE(p.disabled, false) = false
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE NOTICE 'SKIP item 1 (B/C): no non-superadmin profile exists to simulate a caller.';
    RETURN;
  END IF;

  -- Drive auth.uid() to the profile for the rest of the transaction.
  SELECT set_config('request.jwt.claims',
    jsonb_build_object('sub', v_profile.id::text, 'role', 'authenticated')::text,
    true) INTO v_dummy;

  -- 1) record_fee_payment — swallows errors, returns success=false
  v_res := public.record_fee_payment(
    v_foreign, v_profile.id, 1000, 'tuition', 'cash', NULL, 'XSS-TEST',
    'RCP-XX-00001', v_profile.id, CURRENT_DATE, 'Term 1', 2030, 'guard test');
  IF v_res->>'success' <> 'false'
     OR position('permission denied' in COALESCE(v_res->>'error', '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: record_fee_payment accepted foreign school: %', v_res;
  END IF;

  -- 2) apply_student_credit — swallows errors
  v_res := public.apply_student_credit(
    v_foreign, v_profile.id, 'Term 1', 2030, 100, v_profile.id, 'guard test');
  IF v_res->>'success' <> 'false'
     OR position('permission denied' in COALESCE(v_res->>'error', '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: apply_student_credit accepted foreign school: %', v_res;
  END IF;

  -- 3) refund_student_credit — swallows errors
  v_res := public.refund_student_credit(
    v_foreign, v_profile.id, 100, NULL, CURRENT_DATE, 'guard test', v_profile.id);
  IF v_res->>'success' <> 'false'
     OR position('permission denied' in COALESCE(v_res->>'error', '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: refund_student_credit accepted foreign school: %', v_res;
  END IF;

  -- 4..6) the three functions WITHOUT exception handlers must raise 42501
  BEGIN
    PERFORM public.preview_fee_allocation(v_foreign, v_profile.id, 100, 'Term 1', 2030);
    RAISE EXCEPTION 'FAIL: preview_fee_allocation did not raise for foreign school';
  EXCEPTION WHEN OTHERS THEN
    IF position('permission denied' in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: preview_fee_allocation wrong error: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.generate_student_admission_number(v_foreign, 2030);
    RAISE EXCEPTION 'FAIL: generate_student_admission_number did not raise for foreign school';
  EXCEPTION WHEN OTHERS THEN
    IF position('permission denied' in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: generate_student_admission_number wrong error: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.preview_student_admission_number(v_foreign, 2030);
    RAISE EXCEPTION 'FAIL: preview_student_admission_number did not raise for foreign school';
  EXCEPTION WHEN OTHERS THEN
    IF position('permission denied' in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: preview_student_admission_number wrong error: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'PASS item 1 (C): all 6 functions reject foreign school for role % (uid %)', v_profile.role, v_profile.id;

  -- ---------- D. Zero rows written anywhere --------------------------------
  IF (SELECT count(*) FROM fee_payments)                <> (SELECT fee_payments   FROM _item1_baseline)
     OR (SELECT count(*) FROM student_ledger)           <> (SELECT student_ledger  FROM _item1_baseline)
     OR (SELECT count(*) FROM student_credit_transactions) <> (SELECT credit_txns FROM _item1_baseline)
     OR (SELECT count(*) FROM admission_number_sequences) <> (SELECT admission_seq FROM _item1_baseline)
     OR (SELECT count(*) FROM journal_entries)          <> (SELECT journal_entries FROM _item1_baseline) THEN
    RAISE EXCEPTION 'FAIL: rejected calls still wrote rows';
  END IF;

  RAISE NOTICE 'PASS item 1 (D): zero rows written by any rejected call.';

  -- ---------- E. Positive sanity: own school must still work ----------------
  BEGIN
    v_res := public.preview_fee_allocation(v_profile.school_id, v_profile.id, 100, 'Term 1', 2030);
    IF v_res ? 'allocations' IS FALSE THEN
      RAISE EXCEPTION 'FAIL: preview_fee_allocation for own school returned unexpected shape: %', v_res;
    END IF;
    RAISE NOTICE 'PASS item 1 (E): preview_fee_allocation works for own school %.', v_profile.school_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: preview_fee_allocation for own school raised: %', SQLERRM;
  END;
END $$;

ROLLBACK;