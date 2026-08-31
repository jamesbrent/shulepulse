-- ============================================================================
-- 130_cheques_in_clearing regression test — run in the Supabase SQL editor.
-- ============================================================================
-- Run AFTER applying supabase/migrations/130_cheques_in_clearing.sql.
-- Exercises FINANCE HARDENING ITEM 3 closure:
--   A. cheque receipt books Dr 1050 (Clearing), 'cleared' moves Dr 1020 | Cr 1050
--   C. cleared-then-BOUNCED cheque → receipt AND clearing-move entries reversed
--   D. uncleared BOUNCED cheque → receipt reversed, bank never touched
--   E. idempotency: re-clearing adds no duplicate move entry
-- Every JE is balanced, so the 129 constraint trigger (if applied) passes at
-- commit. Everything runs inside a transaction that ROLLBACKs at the end.
-- Synthetic year 9999.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school  UUID; v_student UUID; v_profile UUID;
  v_a1020 UUID; v_a1050 UUID; v_a1110 UUID;
  v_pay_id  UUID; v_je_id UUID; v_clear_je UUID;
  v_entry_no TEXT; v_res JSONB; v_out NUMERIC;
  v_base1020 NUMERIC; v_base1050 NUMERIC; v_base1110 NUMERIC;
  v_d1020 NUMERIC; v_d1050 NUMERIC; v_d1110 NUMERIC;
  v_dr1020 NUMERIC; v_cr1050 NUMERIC;
  v_rev_je UUID; v_move_count INT; v_pay_status TEXT; v_track_status TEXT;
  v_ledger_neg NUMERIC;
BEGIN
  -- ── environment probe + chart ────────────────────────────────────────────
  SELECT s.id INTO v_school
  FROM schools s
  JOIN students st ON st.school_id = s.id
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'FAILED setup: no school with a student found';
  END IF;
  SELECT id INTO v_student FROM students WHERE school_id = v_school LIMIT 1;
  SELECT id INTO v_profile FROM profiles WHERE school_id = v_school LIMIT 1;

  SELECT id INTO v_a1020 FROM chart_of_accounts WHERE school_id = v_school AND code = '1020';
  IF v_a1020 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1020', 'Cash at Bank (Main)', 'asset', 'Cash & Bank') RETURNING id INTO v_a1020;
  END IF;
  SELECT id INTO v_a1050 FROM chart_of_accounts WHERE school_id = v_school AND code = '1050';
  IF v_a1050 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1050', 'Cheques in Clearing', 'asset', 'Cash & Bank') RETURNING id INTO v_a1050;
  END IF;
  SELECT id INTO v_a1110 FROM chart_of_accounts WHERE school_id = v_school AND code = '1110';
  IF v_a1110 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1110', 'Student Fee Receivables', 'asset', 'Accounts Receivable') RETURNING id INTO v_a1110;
  END IF;

  -- Baseline net postings on the three accounts (robust against other data).
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_base1020
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1020;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_base1050
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1050;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_base1110
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1110;
  RAISE NOTICE 'setup: school=%, student=%, base 1020=%, 1050=%, 1110=%',
    v_school, v_student, v_base1020, v_base1050, v_base1110;

  -- Charge in the synthetic year.
  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 5000, 'Term 1', 9999, 'AUTOTEST charge (130)');
  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 5000 THEN RAISE EXCEPTION 'FAILED setup: baseline outstanding = %', v_out; END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- A. record cheque (books Dr 1050), then CLEAR (moves Dr 1020 | Cr 1050)
  -- ════════════════════════════════════════════════════════════════════════
  v_res := record_fee_payment(
    v_school, v_student, 5000, 'cheque', 'cheque', 'Equity', 'CHQ-130A', 'TEST-RCT-130-A',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt A');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED A record: %', v_res->>'error';
  END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;

  INSERT INTO cheque_tracking
    (school_id, payment_id, student_id, cheque_number, bank_name, amount,
     issue_date, clearance_date, status, notes, term, year)
  VALUES (v_school, v_pay_id, v_student, 'CHQ-130A', 'Equity', 5000,
          CURRENT_DATE, NULL, 'pending', 'AUTOTEST', 'Term 1', 9999);

  -- mimic the client record-time GL (postFeePaymentToGL now books cheques to 1050)
  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST receipt A GL', 'fees',
          'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1050, 5000, 0, 'AUTOTEST Dr clearing'), (v_je_id, v_a1110, 0, 5000, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1050
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1050;
  IF v_d1050 - v_base1050 <> 5000 THEN RAISE EXCEPTION 'FAILED A: clearing delta = % (expected 5000)', v_d1050 - v_base1050; END IF;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1020
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1020;
  IF v_d1020 - v_base1020 <> 0 THEN RAISE EXCEPTION 'FAILED A: bank delta after receipt = % (expected 0)', v_d1020 - v_base1020; END IF;
  RAISE NOTICE 'PASS A: cheque receipt parked in 1050 — bank untouched';

  v_res := update_cheque_status(v_pay_id, 'cleared', v_profile, 'cleared by AUTOTEST');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED A clear: %', v_res->>'error'; END IF;
  IF v_res->>'status' <> 'cleared' THEN RAISE EXCEPTION 'FAILED A status=%', v_res->>'status'; END IF;

  SELECT id INTO v_clear_je
  FROM journal_entries
  WHERE school_id = v_school AND status = 'posted' AND source = 'transfer'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  IF v_clear_je IS NULL THEN RAISE EXCEPTION 'FAILED A: no clearing→bank move journal found'; END IF;

  SELECT COALESCE(SUM(l.debit), 0) INTO v_dr1020 FROM journal_entry_lines l
  WHERE l.journal_entry_id = v_clear_je AND l.account_id = v_a1020;
  SELECT COALESCE(SUM(l.credit), 0) INTO v_cr1050 FROM journal_entry_lines l
  WHERE l.journal_entry_id = v_clear_je AND l.account_id = v_a1050;
  IF v_dr1020 <> 5000 OR v_cr1050 <> 5000 THEN
    RAISE EXCEPTION 'FAILED A: move entry Dr1020=% Cr1050=% (expected 5000/5000)', v_dr1020, v_cr1050;
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1020
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1020;
  IF v_d1020 - v_base1020 <> 5000 THEN RAISE EXCEPTION 'FAILED A: bank delta after clear = % (expected 5000)', v_d1020 - v_base1020; END IF;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1050
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1050;
  IF v_d1050 - v_base1050 <> 0 THEN RAISE EXCEPTION 'FAILED A: clearing delta after clear = % (expected 0)', v_d1050 - v_base1050; END IF;

  SELECT cheque_status INTO v_pay_status FROM fee_payments WHERE id = v_pay_id;
  IF v_pay_status <> 'cleared' THEN RAISE EXCEPTION 'FAILED A cheque_status=%', v_pay_status; END IF;
  SELECT status INTO v_track_status FROM cheque_tracking WHERE payment_id = v_pay_id;
  IF v_track_status <> 'cleared' THEN RAISE EXCEPTION 'FAILED A cheque_tracking=%', v_track_status; END IF;
  SELECT count(*) INTO v_move_count FROM audit_logs WHERE action = 'cheque_cleared' AND details->>'payment_id' = v_pay_id::text;
  IF v_move_count < 1 THEN RAISE EXCEPTION 'FAILED A: no cheque_cleared audit row'; END IF;
  RAISE NOTICE 'PASS A: cleared → Dr 1020 % | Cr 1050 %, bank delta +5000, clearing back to 0', v_dr1020, v_cr1050;

  -- ════════════════════════════════════════════════════════════════════════
  -- C. second cheque, CLEAR then BOUNCE → receipt AND move both reversed
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 4000, 'Term 1', 9999, 'AUTOTEST charge (130 C)');
  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 4000 THEN RAISE EXCEPTION 'FAILED C setup: outstanding = %', v_out; END IF;

  v_res := record_fee_payment(
    v_school, v_student, 4000, 'cheque', 'cheque', 'KCB', 'CHQ-130C', 'TEST-RCT-130-C',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt C');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED C record: %', v_res->>'error'; END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;
  INSERT INTO cheque_tracking
    (school_id, payment_id, student_id, cheque_number, bank_name, amount,
     issue_date, clearance_date, status, notes, term, year)
  VALUES (v_school, v_pay_id, v_student, 'CHQ-130C', 'KCB', 4000,
          CURRENT_DATE, NULL, 'pending', 'AUTOTEST', 'Term 1', 9999);

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST receipt C GL', 'fees',
          'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1050, 4000, 0, 'AUTOTEST Dr clearing'), (v_je_id, v_a1110, 0, 4000, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  v_res := update_cheque_status(v_pay_id, 'cleared', v_profile);
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED C clear: %', v_res->>'error'; END IF;

  v_res := update_cheque_status(v_pay_id, 'bounced', v_profile, 'bank returned it');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED C bounce: %', v_res->>'error'; END IF;
  IF jsonb_array_length(v_res->'move_reversals') < 1 THEN
    RAISE EXCEPTION 'FAILED C: bounce did not reverse the clearing move entry';
  END IF;

  -- Receipt JE reversed AND the move JE reversed.
  SELECT status INTO v_pay_status FROM journal_entries WHERE id = v_je_id;
  IF v_pay_status <> 'reversed' THEN RAISE EXCEPTION 'FAILED C: receipt journal not reversed (%=%)', v_pay_status, v_je_id; END IF;
  SELECT id INTO v_clear_je
  FROM journal_entries
  WHERE school_id = v_school AND status = 'reversed' AND source = 'transfer'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  IF v_clear_je IS NULL THEN RAISE EXCEPTION 'FAILED C: clearing move entry not reversed'; END IF;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1020
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1020;
  IF v_d1020 - v_base1020 <> 5000 THEN
    RAISE EXCEPTION 'FAILED C: bank delta after bounce = % (expected 5000 — only A remains)', v_d1020 - v_base1020;
  END IF;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1050
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1050;
  IF v_d1050 - v_base1050 <> 0 THEN RAISE EXCEPTION 'FAILED C: clearing delta after bounce = %', v_d1050 - v_base1050; END IF;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1110
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1110;
  IF v_d1110 - v_base1110 <> -5000 THEN RAISE EXCEPTION 'FAILED C: receivable delta = % (expected -5000, only A)', v_d1110 - v_base1110; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 4000 THEN RAISE EXCEPTION 'FAILED C: outstanding after bounce = % (expected 4000)', v_out; END IF;

  SELECT cheque_status INTO v_pay_status FROM fee_payments WHERE id = v_pay_id;
  IF v_pay_status <> 'reversed' THEN RAISE EXCEPTION 'FAILED C cheque_status=%', v_pay_status; END IF;
  SELECT status INTO v_track_status FROM cheque_tracking WHERE payment_id = v_pay_id;
  IF v_track_status <> 'bounced' THEN RAISE EXCEPTION 'FAILED C cheque_tracking=%', v_track_status; END IF;

  -- Negative student_ledger row present for the reversed payment.
  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_neg
  FROM student_ledger WHERE reference_id = v_pay_id AND entry_type = 'payment' AND amount < 0;
  IF v_ledger_neg <> -4000 THEN RAISE EXCEPTION 'FAILED C: reversal ledger = % (expected -4000)', v_ledger_neg; END IF;

  SELECT count(*) INTO v_move_count FROM journal_entries
  WHERE school_id = v_school AND source = 'transfer' AND status = 'posted'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  IF v_move_count <> 0 THEN RAISE EXCEPTION 'FAILED C: loose posted move entry remains (%)', v_move_count; END IF;
  RAISE NOTICE 'PASS C: bounced after cleared — bank, clearing, receivable all restored';

  -- ════════════════════════════════════════════════════════════════════════
  -- D. uncleared cheque BOUNCED directly → receipt reversed, bank untouched
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 3000, 'Term 1', 9999, 'AUTOTEST charge (130 D)');
  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 7000 THEN RAISE EXCEPTION 'FAILED D setup: outstanding = %', v_out; END IF;

  v_res := record_fee_payment(
    v_school, v_student, 3000, 'cheque', 'cheque', 'Equity', 'CHQ-130D', 'TEST-RCT-130-D',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt D');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED D record: %', v_res->>'error'; END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST receipt D GL', 'fees',
          'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1050, 3000, 0, 'AUTOTEST Dr clearing'), (v_je_id, v_a1110, 0, 3000, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  v_res := update_cheque_status(v_pay_id, 'bounced', v_profile, 'NSF');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAILED D bounce: %', v_res->>'error'; END IF;
  IF jsonb_array_length(v_res->'move_reversals') <> 0 THEN
    RAISE EXCEPTION 'FAILED D: expected no clearing-move reversals for an uncleared bounce';
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1020
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1020;
  IF v_d1020 - v_base1020 <> 5000 THEN RAISE EXCEPTION 'FAILED D: bank delta = % (expected 5000, untouched by D)', v_d1020 - v_base1020; END IF;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_d1050
  FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.school_id = v_school AND je.status = 'posted' AND l.account_id = v_a1050;
  IF v_d1050 - v_base1050 <> 0 THEN RAISE EXCEPTION 'FAILED D: clearing delta = %', v_d1050 - v_base1050; END IF;
  SELECT status INTO v_pay_status FROM journal_entries WHERE id = v_je_id;
  IF v_pay_status <> 'reversed' THEN RAISE EXCEPTION 'FAILED D: receipt journal not reversed'; END IF;
  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 7000 THEN RAISE EXCEPTION 'FAILED D: outstanding = % (expected 7000)', v_out; END IF;
  RAISE NOTICE 'PASS D: uncleared bounce reversed out of clearing — bank untouched';

  -- ════════════════════════════════════════════════════════════════════════
  -- E. re-clearing an already-cleared cheque adds no duplicate move entry
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_pay_id FROM fee_payments WHERE receipt_number = 'TEST-RCT-130-A';
  SELECT count(*) INTO v_move_count FROM journal_entries
  WHERE school_id = v_school AND source = 'transfer' AND status = 'posted'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  v_res := update_cheque_status(v_pay_id, 'cleared', v_profile);
  IF v_res->>'already' <> 'cleared' THEN RAISE EXCEPTION 'FAILED E: expected already=cleared, got %', v_res; END IF;
  SELECT count(*) INTO v_rev_je FROM journal_entries
  WHERE school_id = v_school AND source = 'transfer' AND status = 'posted'
    AND reference_type = 'fee_payment' AND reference_id = v_pay_id;
  IF v_rev_je <> v_move_count THEN
    RAISE EXCEPTION 'FAILED E: duplicate clearing-move entries (% → %)', v_move_count, v_rev_je;
  END IF;
  RAISE NOTICE 'PASS E: re-clear is idempotent — no duplicate move entry';

  -- Optional: prove every journal in the session balances (item-7 trigger).
  BEGIN
    SET CONSTRAINTS trg_journal_entry_balance IMMEDIATE;
    RAISE NOTICE 'PASS: all test journal entries are balanced (item-7 constraint)';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'FAILED: an unbalanced journal entry was created by this test';
  END;

  RAISE NOTICE 'ALL 130 TESTS PASSED — transaction ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;