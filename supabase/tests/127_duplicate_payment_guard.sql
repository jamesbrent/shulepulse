-- ============================================================================
-- 127_duplicate_payment_guard regression test — Supabase SQL editor.
-- ============================================================================
-- Run AFTER supabase/migrations/127_duplicate_payment_guard.sql.
-- Exercises FINANCE HARDENING ITEM 4:
--   A. identical payment within 60s  → duplicate:true, same payment_id, and
--      ONLY ONE fee_payments / student_ledger row is written;
--   B. same payment but DIFFERENT reference → new payment (not a duplicate);
--   C. window expiry (created_at backdated past 60s) → allowed again.
-- Transaction ROLLBACKs at the end; synthetic year 9999.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school  UUID; v_student UUID; v_profile UUID;
  v_pay1    UUID; v_pay2 UUID;
  v_res     JSONB;
  v_cnt     INT;
  v_ledger  NUMERIC;
BEGIN
  SELECT s.id INTO v_school
  FROM schools s JOIN students st ON st.school_id = s.id
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'FAILED setup: no school with students'; END IF;
  SELECT id INTO v_student FROM students WHERE school_id = v_school LIMIT 1;
  SELECT id INTO v_profile FROM profiles WHERE school_id = v_school LIMIT 1;

  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 20000, 'Term 1', 9999, 'AUTOTEST charge (127)');

  -- ── A. exact repeat inside the window ─────────────────────────────────────
  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cash', 'cash', NULL, 'MP-100', 'TEST-RCT-127-A1',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST A1');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A record 1: %', v_res->>'error'; END IF;
  IF (v_res->>'duplicate')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAILED A: first call flagged duplicate'; END IF;
  v_pay1 := (v_res->>'payment_id')::uuid;

  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cash', 'cash', NULL, 'MP-100', 'TEST-RCT-127-A2',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST A2 (repeat)');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A record 2: %', v_res->>'error'; END IF;
  IF (v_res->>'duplicate')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A: repeat not flagged duplicate'; END IF;
  v_pay2 := (v_res->>'payment_id')::uuid;
  IF v_pay2 <> v_pay1 THEN RAISE EXCEPTION 'FAILED A: duplicate returned a different payment id (%)', v_pay2; END IF;

  SELECT count(*) INTO v_cnt FROM fee_payments WHERE id IN (v_pay1, v_pay2);
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAILED A: % payment rows exist (expected 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM student_ledger
  WHERE reference_id = v_pay1 AND entry_type = 'payment';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAILED A: % ledger rows (expected 1)', v_cnt; END IF;
  RAISE NOTICE 'PASS A: exact repeat deduped — single payment, single ledger row';

  -- ── B. different reference, same student/amount → distinct payment ───────
  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cash', 'cash', NULL, 'MP-200', 'TEST-RCT-127-B',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST B');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED B: %', v_res->>'error'; END IF;
  IF (v_res->>'duplicate')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAILED B: different reference flagged duplicate'; END IF;
  IF (v_res->>'payment_id')::uuid = v_pay1 THEN RAISE EXCEPTION 'FAILED B: reused payment id for a distinct receipt'; END IF;

  SELECT count(*) INTO v_cnt FROM fee_payments
  WHERE student_id = v_student AND amount = 1500 AND term = 'Term 1' AND year = 9999
    AND created_at > now() - interval '60 seconds';
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'FAILED B: % payments in window (expected 2)', v_cnt; END IF;
  RAISE NOTICE 'PASS B: different reference = distinct payment';

  -- ── C. window expiry → retry is a fresh payment ───────────────────────────
  UPDATE fee_payments SET created_at = now() - interval '90 seconds' WHERE id = v_pay1;

  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cash', 'cash', NULL, 'MP-100', 'TEST-RCT-127-C',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST C (after window)');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED C: %', v_res->>'error'; END IF;
  IF (v_res->>'duplicate')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAILED C: expired payment still flagged duplicate'; END IF;
  RAISE NOTICE 'PASS C: window expiry allows a new payment';

  SELECT count(*) INTO v_cnt FROM fee_payments
  WHERE student_id = v_student AND amount = 1500 AND term = 'Term 1' AND year = 9999
    AND created_at > now() - interval '60 seconds';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAILED C: expected exactly 1 recent payment, found %', v_cnt; END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_ledger FROM student_ledger
  WHERE student_id = v_student AND term = 'Term 1' AND year = 9999 AND entry_type = 'payment';
  IF v_ledger <> 3000 THEN RAISE EXCEPTION 'FAILED ledger total = % (expected 3000 — three distinct payments)', v_ledger; END IF;

  RAISE NOTICE 'ALL 127 TESTS PASSED — transaction ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;