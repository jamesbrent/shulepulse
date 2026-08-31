-- ============================================================================
-- 126_cheque_lifecycle regression test — run in the Supabase SQL editor.
-- ============================================================================
-- Run AFTER supabase/migrations/126_cheque_lifecycle.sql (and 125).
-- Exercises FINANCE HARDENING ITEM 3:
--   A. 'cleared'  → status + clearance_date + (130+) clearing→bank move entry
--                    Dr 1020 | Cr 1050 (see 130 for the exact money movement);
--   B. 'bounced'  → full reverse_fee_payment() (ledger + GL + status) and
--                    cheque_tracking.status = 'bounced';
--   C. guards     → non-cheque rejected, double-bounce refused.
-- Transaction rolls back at the end; synthetic year 9999 never touches real
-- terms. Requires at least one school with a student.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school  UUID; v_student UUID; v_profile UUID;
  v_a1020 UUID; v_a1110 UUID;
  v_pay_id  UUID; v_je_id UUID; v_entry_no TEXT;
  v_amt     NUMERIC; v_je_count INT; v_res JSONB;
  v_je_before INT; v_ledger_before NUMERIC;
  v_out NUMERIC;
  v_track_status TEXT;
  v_clearance    DATE;
BEGIN
  SELECT s.id INTO v_school
  FROM schools s JOIN students st ON st.school_id = s.id
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'FAILED setup: no school with students'; END IF;
  SELECT id INTO v_student FROM students WHERE school_id = v_school LIMIT 1;
  SELECT id INTO v_profile FROM profiles WHERE school_id = v_school LIMIT 1;

  SELECT id INTO v_a1020 FROM chart_of_accounts WHERE school_id = v_school AND code = '1020';
  IF v_a1020 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1020', 'Cash at Bank (Main)', 'asset', 'Cash & Bank') RETURNING id INTO v_a1020;
  END IF;
  SELECT id INTO v_a1110 FROM chart_of_accounts WHERE school_id = v_school AND code = '1110';
  IF v_a1110 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1110', 'Student Fee Receivables', 'asset', 'Accounts Receivable') RETURNING id INTO v_a1110;
  END IF;

  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 5000, 'Term 1', 9999, 'AUTOTEST charge (126)');

  -- ── A. record cheque, link a receipt GL (client behaviour), CLEAR it ─────
  v_res := record_fee_payment(
    v_school, v_student, 2000, 'cheque', 'cheque', 'Equity', 'CHQ-200', 'TEST-RCT-126-A',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt A');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A record: %', v_res->>'error'; END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;

  INSERT INTO cheque_tracking
    (school_id, payment_id, student_id, cheque_number, bank_name, amount,
     issue_date, clearance_date, status, notes, term, year)
  VALUES
    (v_school, v_pay_id, v_student, 'CHQ-200', 'Equity', 2000,
     CURRENT_DATE, NULL, 'pending', 'AUTOTEST', 'Term 1', 9999);

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST receipt A GL', 'fees',
          'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1020, 2000, 0, 'AUTOTEST Dr bank'), (v_je_id, v_a1110, 0, 2000, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  SELECT count(*) INTO v_je_before FROM journal_entries WHERE school_id = v_school AND status = 'posted';

  v_res := update_cheque_status(v_pay_id, 'cleared', v_profile, 'cleared by AUTOTEST');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A clear: %', v_res->>'error'; END IF;
  IF v_res->>'status' <> 'cleared' THEN RAISE EXCEPTION 'FAILED A status=%', v_res->>'status'; END IF;

  SELECT cheque_status INTO v_amt FROM fee_payments WHERE id = v_pay_id;
  IF v_amt <> 'cleared' THEN RAISE EXCEPTION 'FAILED A fee_payments.cheque_status=%', v_amt; END IF;

  SELECT status, clearance_date INTO v_track_status, v_clearance FROM cheque_tracking WHERE payment_id = v_pay_id;
  IF v_track_status <> 'cleared' THEN RAISE EXCEPTION 'FAILED A cheque_tracking.status=%', v_track_status; END IF;
  IF v_clearance IS NULL THEN RAISE EXCEPTION 'FAILED A clearance_date not set'; END IF;

  -- 130+ semantics: clearing now posts a Dr Bank | Cr Clearing move entry.
  SELECT count(*) INTO v_je_count
  FROM journal_entries
  WHERE school_id = v_school AND status = 'posted' AND source = 'transfer'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  IF v_je_count <> 1 THEN
    RAISE EXCEPTION 'FAILED A: expected 1 clearing-move journal after 130, found %', v_je_count;
  END IF;
  RAISE NOTICE 'PASS A: cheque cleared — status + clearance_date + clearing→bank move (130+)';

  -- ── C1. guard: clearing a non-cheque cash payment must fail ──────────────
  v_res := record_fee_payment(
    v_school, v_student, 500, 'cash', 'cash', NULL, NULL, 'TEST-RCT-126-C1',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST C1');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED C1 record: %', v_res->>'error'; END IF;
  v_res := update_cheque_status((v_res->>'payment_id')::uuid, 'cleared', v_profile);
  IF (v_res->>'success')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAILED C1: cash payment was accepted for cheque clear'; END IF;
  RAISE NOTICE 'PASS C1: non-cheque payment rejected';

  -- ── B. second cheque, BOUNCE it → full reversal ──────────────────────────
  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cheque', 'cheque', 'KCB', 'CHQ-201', 'TEST-RCT-126-B',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt B');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED B record: %', v_res->>'error'; END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;

  INSERT INTO cheque_tracking
    (school_id, payment_id, student_id, cheque_number, bank_name, amount,
     issue_date, clearance_date, status, notes, term, year)
  VALUES
    (v_school, v_pay_id, v_student, 'CHQ-201', 'KCB', 1500,
     CURRENT_DATE, NULL, 'pending', 'AUTOTEST', 'Term 1', 9999);

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST receipt B GL', 'fees',
          'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1020, 1500, 0, 'AUTOTEST Dr bank'), (v_je_id, v_a1110, 0, 1500, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_ledger_before;

  v_res := update_cheque_status(v_pay_id, 'bounced', v_profile, 'NSF AUTOTEST');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED B bounce: %', v_res->>'error'; END IF;
  IF v_res->>'status' <> 'bounced' THEN RAISE EXCEPTION 'FAILED B status=%', v_res->>'status'; END IF;

  SELECT cheque_status INTO v_amt FROM fee_payments WHERE id = v_pay_id;
  IF COALESCE(v_amt, '') <> 'reversed' THEN RAISE EXCEPTION 'FAILED B fee_payments.status=%', v_amt; END IF;

  SELECT status INTO v_track_status FROM cheque_tracking WHERE payment_id = v_pay_id;
  IF v_track_status <> 'bounced' THEN RAISE EXCEPTION 'FAILED B cheque_tracking.status=%', v_track_status; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> v_ledger_before THEN RAISE EXCEPTION 'FAILED B: outstanding % before %, expected equal', v_out, v_ledger_before; END IF;

  SELECT status INTO v_amt FROM journal_entries WHERE id = v_je_id;
  IF v_amt <> 'reversed' THEN RAISE EXCEPTION 'FAILED B original JE status=%', v_amt; END IF;
  RAISE NOTICE 'PASS B: cheque bounced — full reversal + tracking';

  -- ── C2. guard: bouncing the reversed payment must be refused ─────────────
  v_res := update_cheque_status(v_pay_id, 'bounced', v_profile, 'again');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAILED C2: double bounce allowed'; END IF;
  RAISE NOTICE 'PASS C2: double bounce refused';

  RAISE NOTICE 'ALL 126 TESTS PASSED — transaction ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;