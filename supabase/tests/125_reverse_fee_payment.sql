-- ============================================================================
-- 125_reverse_fee_payment regression test — run in the Supabase SQL editor.
-- ============================================================================
-- Run this AFTER applying supabase/migrations/125_reverse_fee_payment.sql.
-- It exercises the three required reversal paths for FINANCE HARDENING ITEM 2:
--   A. cash payment fully applied to a term   → GL + ledger + status
--   B. cheque payment                        → + cheque_tracking
--   C. overpayment that created excess credit → + credit ledger 'reversal'
-- Plus idempotency (second reversal must be refused).
--
-- Everything runs inside a transaction that ROLLBACKs at the end, so no data
-- is persisted. Uses a synthetic year (9999) so it never touches real terms.
-- Before applying 124, ensure 124 migrations are applied (guard is used).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school   UUID;
  v_student  UUID;
  v_profile  UUID;
  v_a1010 UUID; v_a1020 UUID; v_a1030 UUID; v_a1110 UUID; v_a2230 UUID;
  v_pay_id   UUID;
  v_je_id    UUID;
  v_rev_je   UUID;
  v_entry_no TEXT;
  v_out      NUMERIC;
  v_bal_a    NUMERIC;
  v_bal_b    NUMERIC;
  v_amt      NUMERIC;
  v_res      JSONB;
  v_cnt      INT;
  v_lines    INT;
  v_dr       NUMERIC;
  v_cr       NUMERIC;
BEGIN
  -- ── environment probe ──────────────────────────────────────────────────
  SELECT s.id INTO v_school
  FROM schools s
  JOIN students st ON st.school_id = s.id
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'FAILED setup: no school with a student found — seed data required';
  END IF;

  SELECT id INTO v_student FROM students WHERE school_id = v_school LIMIT 1;
  SELECT id INTO v_profile FROM profiles WHERE school_id = v_school LIMIT 1;
  RAISE NOTICE 'setup: school=%, student=%, profile=%', v_school, v_student, v_profile;

  -- ── ensure the chart rows we need exist (same columns as ensureAccounts) ─
  SELECT id INTO v_a1010 FROM chart_of_accounts WHERE school_id = v_school AND code = '1010';
  IF v_a1010 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1010', 'Petty Cash', 'asset', 'Cash & Bank') RETURNING id INTO v_a1010;
  END IF;
  SELECT id INTO v_a1020 FROM chart_of_accounts WHERE school_id = v_school AND code = '1020';
  IF v_a1020 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1020', 'Cash at Bank (Main)', 'asset', 'Cash & Bank') RETURNING id INTO v_a1020;
  END IF;
  SELECT id INTO v_a1030 FROM chart_of_accounts WHERE school_id = v_school AND code = '1030';
  IF v_a1030 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1030', 'Mobile Money Account', 'asset', 'Cash & Bank') RETURNING id INTO v_a1030;
  END IF;
  SELECT id INTO v_a1110 FROM chart_of_accounts WHERE school_id = v_school AND code = '1110';
  IF v_a1110 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1110', 'Student Fee Receivables', 'asset', 'Accounts Receivable') RETURNING id INTO v_a1110;
  END IF;
  SELECT id INTO v_a2230 FROM chart_of_accounts WHERE school_id = v_school AND code = '2230';
  IF v_a2230 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '2230', 'Student Credit / Advance Payments', 'liability', 'Deposits') RETURNING id INTO v_a2230;
  END IF;

  -- ── baseline charge in the synthetic year 9999 ─────────────────────────
  INSERT INTO student_ledger (school_id, student_id, entry_type, amount, term, year, description)
  VALUES (v_school, v_student, 'charge', 5000, 'Term 1', 9999, 'AUTOTEST charge (125)');

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 5000 THEN RAISE EXCEPTION 'FAILED setup: baseline outstanding = % (expected 5000)', v_out; END IF;
  RAISE NOTICE 'PASS setup: baseline outstanding = %', v_out;

  -- ════════════════════════════════════════════════════════════════════════
  -- SCENARIO A — cash, fully applied
  -- ════════════════════════════════════════════════════════════════════════
  v_res := record_fee_payment(
    v_school, v_student, 5000, 'cash', 'cash', NULL, 'AUTOTEST-A', 'TEST-RCT-A',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt A');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED A record: %', v_res->>'error';
  END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;
  IF (v_res->>'applied_amount')::numeric <> 5000 THEN RAISE EXCEPTION 'FAILED A applied=%', v_res->>'applied_amount'; END IF;
  IF (v_res->>'credit_amount')::numeric <> 0 THEN RAISE EXCEPTION 'FAILED A credit=%', v_res->>'credit_amount'; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 0 THEN RAISE EXCEPTION 'FAILED A: outstanding after payment = % (expected 0)', v_out; END IF;

  -- mimic the client's GL posting for this receipt
  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES
    (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST fee payment A', 'fees',
     'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1010, 5000, 0, 'AUTOTEST Dr cash'), (v_je_id, v_a1110, 0, 5000, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  -- reverse
  v_res := reverse_fee_payment(v_pay_id, v_profile, 'AUTOTEST reversal A');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED A reverse: %', v_res->>'error';
  END IF;
  v_rev_je := (v_res->>'reversal_journal_id')::uuid;
  IF v_rev_je IS NULL THEN RAISE EXCEPTION 'FAILED A: no reversal journal returned'; END IF;
  IF (v_res->>'ledger_reversed')::numeric <> 5000 THEN RAISE EXCEPTION 'FAILED A ledger_reversed=%', v_res->>'ledger_reversed'; END IF;

  -- assertions A
  SELECT cheque_status INTO v_amt FROM fee_payments WHERE id = v_pay_id;
  IF COALESCE(v_amt, '') <> 'reversed' THEN RAISE EXCEPTION 'FAILED A: fee_payments.cheque_status=%', v_amt; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 5000 THEN RAISE EXCEPTION 'FAILED A: outstanding after reversal = % (expected 5000)', v_out; END IF;

  SELECT count(*) INTO v_cnt FROM student_ledger
  WHERE reference_id = v_pay_id AND entry_type = 'payment';
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'FAILED A: ledger rows for payment = % (expected 2)', v_cnt; END IF;
  SELECT sum(amount) INTO v_amt FROM student_ledger WHERE reference_id = v_pay_id AND entry_type = 'payment';
  IF COALESCE(v_amt, 0) <> 0 THEN RAISE EXCEPTION 'FAILED A: ledger net for payment = % (expected 0)', v_amt; END IF;

  SELECT status INTO v_amt FROM journal_entries WHERE id = v_je_id;
  IF v_amt <> 'reversed' THEN RAISE EXCEPTION 'FAILED A: original JE status = %', v_amt; END IF;

  SELECT count(*) INTO v_lines FROM journal_entry_lines WHERE journal_entry_id = v_rev_je;
  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0) INTO v_dr, v_cr
  FROM journal_entry_lines WHERE journal_entry_id = v_rev_je;
  IF v_lines <> 2 THEN RAISE EXCEPTION 'FAILED A: reversal lines = %', v_lines; END IF;
  IF v_dr <> v_cr THEN RAISE EXCEPTION 'FAILED A: reversal JE unbalanced % vs %', v_dr, v_cr; END IF;
  IF v_dr <> 5000 THEN RAISE EXCEPTION 'FAILED A: reversal JE amount = %', v_dr; END IF;

  -- idempotency
  v_res := reverse_fee_payment(v_pay_id, v_profile, 'AUTOTEST double');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAILED A: second reversal was allowed';
  END IF;
  RAISE NOTICE 'PASS A: cash full-applied reversal (GL + ledger + status + idempotency)';

  -- ════════════════════════════════════════════════════════════════════════
  -- SCENARIO B — cheque
  -- ════════════════════════════════════════════════════════════════════════
  v_res := record_fee_payment(
    v_school, v_student, 1500, 'cheque', 'cheque', 'KCB', 'CHQ-001', 'TEST-RCT-B',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt B');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED B record: %', v_res->>'error';
  END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;
  IF (v_res->>'applied_amount')::numeric <> 1500 THEN RAISE EXCEPTION 'FAILED B applied=%', v_res->>'applied_amount'; END IF;

  INSERT INTO cheque_tracking
    (school_id, payment_id, student_id, cheque_number, bank_name, amount,
     issue_date, clearance_date, status, notes, term, year)
  VALUES
    (v_school, v_pay_id, v_student, 'CHQ-001', 'KCB', 1500,
     CURRENT_DATE, NULL, 'pending', 'AUTOTEST cheque B', 'Term 1', 9999);

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES
    (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST fee payment B (cheque)', 'fees',
     'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1020, 1500, 0, 'AUTOTEST Dr bank'), (v_je_id, v_a1110, 0, 1500, 'AUTOTEST Cr receivable');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  v_res := reverse_fee_payment(v_pay_id, v_profile, 'AUTOTEST reversal B');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED B reverse: %', v_res->>'error';
  END IF;

  SELECT status INTO v_amt FROM cheque_tracking WHERE payment_id = v_pay_id;
  IF COALESCE(v_amt, '') <> 'reversed' THEN RAISE EXCEPTION 'FAILED B: cheque_tracking.status=%', v_amt; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 5000 THEN RAISE EXCEPTION 'FAILED B: outstanding after reversal = % (expected 5000)', v_out; END IF;
  RAISE NOTICE 'PASS B: cheque reversal (GL + ledger + cheque_tracking)';

  -- ════════════════════════════════════════════════════════════════════════
  -- SCENARIO C — overpayment creating excess credit (5000 applied + 5000 credit)
  -- ════════════════════════════════════════════════════════════════════════
  v_bal_a := student_credit_balance(v_school, v_student);

  v_res := record_fee_payment(
    v_school, v_student, 10000, 'cash', 'cash', NULL, 'AUTOTEST-C', 'TEST-RCT-C',
    v_profile, CURRENT_DATE, 'Term 1', 9999, 'AUTOTEST receipt C');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED C record: %', v_res->>'error';
  END IF;
  v_pay_id := (v_res->>'payment_id')::uuid;
  IF (v_res->>'applied_amount')::numeric <> '5000' THEN RAISE EXCEPTION 'FAILED C applied=%', v_res->>'applied_amount'; END IF;
  IF (v_res->>'credit_amount')::numeric <> '5000' THEN RAISE EXCEPTION 'FAILED C credit=%', v_res->>'credit_amount'; END IF;

  v_bal_b := student_credit_balance(v_school, v_student);
  IF v_bal_b - v_bal_a <> 5000 THEN RAISE EXCEPTION 'FAILED C: credit balance move % -> %', v_bal_a, v_bal_b; END IF;
  SELECT count(*) INTO v_cnt FROM student_credit_transactions
  WHERE payment_id = v_pay_id AND type = 'credit';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAILED C: credit txns for payment = %', v_cnt; END IF;

  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, reference_type,
     reference_id, status, created_by, posted_by, posted_at)
  VALUES
    (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST fee payment C', 'fees',
     'fee_payment', v_pay_id, 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
  VALUES (v_je_id, v_a1030, 10000, 0, 'AUTOTEST Dr mobile money'),
         (v_je_id, v_a1110, 0, 5000, 'AUTOTEST Cr receivable'),
         (v_je_id, v_a2230, 0, 5000, 'AUTOTEST Cr student credit');
  UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

  v_res := reverse_fee_payment(v_pay_id, v_profile, 'AUTOTEST reversal C');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED C reverse: %', v_res->>'error';
  END IF;
  IF (v_res->>'credit_reversed')::numeric <> 5000 THEN RAISE EXCEPTION 'FAILED C credit_reversed=%', v_res->>'credit_reversed'; END IF;
  IF (v_res->>'ledger_reversed')::numeric <> 5000 THEN RAISE EXCEPTION 'FAILED C ledger_reversed=%', v_res->>'ledger_reversed'; END IF;

  SELECT student_credit_balance(v_school, v_student) INTO v_bal_b;
  IF v_bal_b <> v_bal_a THEN RAISE EXCEPTION 'FAILED C: credit balance after reversal = % (expected %)', v_bal_b, v_bal_a; END IF;

  SELECT count(*) INTO v_cnt FROM student_credit_transactions
  WHERE payment_id = v_pay_id AND type = 'reversal';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAILED C: reversal credit txns = %', v_cnt; END IF;

  SELECT student_term_outstanding(v_school, v_student, 'Term 1', 9999) INTO v_out;
  IF v_out <> 5000 THEN RAISE EXCEPTION 'FAILED C: outstanding after reversal = % (expected 5000)', v_out; END IF;

  -- reversal JE must stay balanced (Dr 1110 5000 + Dr 2230 5000 vs Cr 1030 10000)
  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0) INTO v_dr, v_cr
  FROM journal_entry_lines
  WHERE journal_entry_id = (SELECT reversal_of FROM journal_entries WHERE id = v_je_id);
  IF v_dr <> v_cr OR v_dr <> 10000 THEN
    RAISE EXCEPTION 'FAILED C: reversal JE dr=% cr=%', v_dr, v_cr;
  END IF;
  RAISE NOTICE 'PASS C: overpayment/credit reversal (GL + ledger + credit ledger)';

  RAISE NOTICE 'ALL 125 TESTS PASSED — transaction will ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;