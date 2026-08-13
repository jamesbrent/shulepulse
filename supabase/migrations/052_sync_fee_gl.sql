-- ════════════════════════════════════════════════════════════════════════
-- 052_SYNC_FEE_GL
-- Synchronizes the EXISTING fee collection with the General Ledger so the
-- GL is the single source of truth for every balance.
--
--   1. fee_assessments.journal_entry_id — links each billing to its GL entry
--      (same link that fee_payments.journal_entry_id provides for receipts).
--   2. Re-declares the journal source CHECK to include 'transfer' (in case
--      051 was never applied on a hosted database).
--   3. Backfill (idempotent, safe to re-run):
--        • fee_payments   → Dr <Cash/Bank/M-Pesa> | Cr <Receivables>  (source 'fees')
--        • fee_assessments→ Dr <Receivables> | Cr <Fee Income 4010>    (source 'fees')
--      Only rows with journal_entry_id IS NULL are processed, so nothing is
--      ever duplicated. Schools without the chart accounts are skipped.
--
-- Entry numbers follow the app convention JE-<yy>-<5 digits>, continuing the
-- per-school/per-year sequence already in journal_entries.
--
-- Requires 036 (chart/journal). Safe to re-run. Run in Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Fee assessments → GL link -------------------------------------------
ALTER TABLE fee_assessments ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- 2. Journal source CHECK must allow 'transfer' (051 dependency) ----------
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'fees', 'payroll', 'assets', 'ap', 'expenses', 'refund', 'budget', 'transfer'));

-- 3. Backfill ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_pay_acc_id   UUID;
  v_recv_acc_id  UUID;
  v_income_acc_id UUID;
  v_je_id        UUID;
  v_year         INT;
  v_seq          INT;
  v_entry_no     TEXT;
BEGIN
  -- 3a. Fee payments → Dr cash/bank/m-pesa | Cr receivables
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

  -- 3b. Fee assessments → Dr receivables | Cr fee income
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
      (school_id, entry_no, entry_date, description, source, reference_type, reference_id, status, posted_at)
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
