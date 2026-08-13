-- ════════════════════════════════════════════════════════════════════════
-- 053_SEED_CASH_ACCOUNTS_AND_BACKFILL
-- Self-healing fix: the 052 fee backfill only posted to accounts that
-- already existed in the school's chart. Cash & Bank accounts are created
-- at runtime by the app (ensureAccounts) and are NOT seeded by any
-- migration — so on databases where no Finance page had been opened yet,
-- the backfill silently skipped every fee payment/assessment (they still
-- have journal_entry_id IS NULL) and the Cash & Bank positions stayed at 0.
--
-- This migration:
--   1. Seeds the Cash & Bank / receivable / fee-income accounts for EVERY
--      school (idempotent — skips schools that already have them).
--   2. Re-runs the fee backfill. It is scoped to rows where
--      journal_entry_id IS NULL, so it can only ADD the missing GL entries
--      and can never duplicate what 052 already posted.
--
-- Safe to re-run. Run in Supabase → SQL Editor (after 036, 051, 052).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Seed chart accounts for every school ----------------------------------
INSERT INTO chart_of_accounts (school_id, code, name, type, category, description)
SELECT s.id, c.code, c.name, c.type, c.category, c.description
FROM schools s
CROSS JOIN (
  VALUES
    ('1010', 'Petty Cash',                'asset',   'Cash & Bank',          'Cash on hand'),
    ('1020', 'Cash at Bank (Main)',       'asset',   'Cash & Bank',          'Main bank account'),
    ('1030', 'Mobile Money Account',      'asset',   'Cash & Bank',          'M-Pesa / mobile money'),
    ('1040', 'Bank — Fixed Deposit',      'asset',   'Cash & Bank',          'Fixed deposits'),
    ('1110', 'Student Fee Receivables',   'asset',   'Accounts Receivable',  'Fees billed minus collected'),
    ('4010', 'Tuition Fees',              'income',  'Fee Income',           'Fee income recognised on billing')
) AS c(code, name, type, category, description)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts a
  WHERE a.school_id = s.id AND a.code = c.code
);

-- 2. Backfill fee payments/assessments still missing their GL entry ---------
DO $$
DECLARE
  r RECORD;
  v_pay_acc_id    UUID;
  v_recv_acc_id   UUID;
  v_income_acc_id UUID;
  v_je_id         UUID;
  v_year          INT;
  v_seq           INT;
  v_entry_no      TEXT;
BEGIN
  -- 2a. Fee payments → Dr cash/bank/m-pesa | Cr receivables
  FOR r IN
    SELECT p.id, p.school_id, p.student_id, p.amount, p.payment_type,
           p.transaction_date, p.receipt_number, s.full_name AS student_name
    FROM fee_payments p
    LEFT JOIN students s ON s.id = p.student_id
    WHERE p.journal_entry_id IS NULL
  LOOP
    SELECT a.id INTO v_pay_acc_id
    FROM chart_of_accounts a
    WHERE a.school_id = r.school_id
      AND a.code = CASE
        WHEN r.payment_type IN ('mobile', 'mobile_money', 'mpesa') THEN '1030'
        WHEN r.payment_type IN ('cash') THEN '1010'
        ELSE '1020'
      END;
    SELECT a.id INTO v_recv_acc_id
    FROM chart_of_accounts a
    WHERE a.school_id = r.school_id AND a.code = '1110';

    IF v_pay_acc_id IS NULL OR v_recv_acc_id IS NULL THEN CONTINUE; END IF;

    v_year := EXTRACT(YEAR FROM COALESCE(r.transaction_date, CURRENT_DATE))::INT;
    SELECT COALESCE(MAX(SPLIT_PART(entry_no, '-', 3)::INT), 0) + 1 INTO v_seq
    FROM journal_entries
    WHERE school_id = r.school_id
      AND entry_no LIKE 'JE-' || SUBSTRING(v_year::TEXT FROM 3) || '-%';
    v_entry_no := 'JE-' || SUBSTRING(v_year::TEXT FROM 3) || '-' || LPAD(v_seq::TEXT, 5, '0');

    INSERT INTO journal_entries
      (school_id, entry_no, entry_date, description, source, reference_type, reference_id, status, posted_at)
    VALUES
      (r.school_id, v_entry_no, r.transaction_date,
       'Fee payment ' || COALESCE(r.receipt_number, '') || ' — ' || COALESCE(r.student_name, 'Student'),
       'fees', 'fee_payment', r.id, 'posted', now())
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
    VALUES
      (v_je_id, v_pay_acc_id,  r.amount, 0, 'Receipt ' || COALESCE(r.receipt_number, '')),
      (v_je_id, v_recv_acc_id, 0, r.amount, 'Fee receivable cleared — ' || COALESCE(r.student_name, 'Student'));

    UPDATE fee_payments SET journal_entry_id = v_je_id WHERE id = r.id;
  END LOOP;

  -- 2b. Fee assessments → Dr receivables | Cr fee income
  FOR r IN
    SELECT a.id, a.school_id, a.student_id, a.amount_due, a.created_at,
           s.full_name AS student_name
    FROM fee_assessments a
    LEFT JOIN students s ON s.id = a.student_id
    WHERE a.journal_entry_id IS NULL
  LOOP
    SELECT a2.id INTO v_recv_acc_id
    FROM chart_of_accounts a2
    WHERE a2.school_id = r.school_id AND a2.code = '1110';
    SELECT a2.id INTO v_income_acc_id
    FROM chart_of_accounts a2
    WHERE a2.school_id = r.school_id AND a2.code = '4010';

    IF v_recv_acc_id IS NULL OR v_income_acc_id IS NULL THEN CONTINUE; END IF;

    v_year := EXTRACT(YEAR FROM COALESCE(r.created_at, CURRENT_DATE))::INT;
    SELECT COALESCE(MAX(SPLIT_PART(entry_no, '-', 3)::INT), 0) + 1 INTO v_seq
    FROM journal_entries
    WHERE school_id = r.school_id
      AND entry_no LIKE 'JE-' || SUBSTRING(v_year::TEXT FROM 3) || '-%';
    v_entry_no := 'JE-' || SUBSTRING(v_year::TEXT FROM 3) || '-' || LPAD(v_seq::TEXT, 5, '0');

    INSERT INTO journal_entries
      (school_id, v_entry_no, entry_date, description, source, reference_type, reference_id, status, posted_at)
    VALUES
      (r.school_id, v_entry_no, r.created_at::date,
       'Fee assessment — ' || COALESCE(r.student_name, 'Student'),
       'fees', 'fee_assessment', r.id, 'posted', now())
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
    VALUES
      (v_je_id, v_recv_acc_id,   r.amount_due, 0, 'Billed — ' || COALESCE(r.student_name, 'Student')),
      (v_je_id, v_income_acc_id, 0, r.amount_due, 'Fee income');

    UPDATE fee_assessments SET journal_entry_id = v_je_id WHERE id = r.id;
  END LOOP;
END $$;
