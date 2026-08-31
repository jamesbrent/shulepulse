-- ============================================================================
-- 129_journal_balance_trigger regression test — Supabase SQL editor.
-- ============================================================================
-- Run AFTER supabase/migrations/129_journal_balance_trigger.sql.
-- Exercises FINANCE HARDENING ITEM 7:
--   A. balanced 2-line posted entry            → accepted;
--   B. unbalanced posted entry                 → rejected (check_violation);
--   C. balanced draft → UPDATE status='posted' → accepted;
--   D. unbalanced draft → UPDATE status='posted' → rejected;
--   E. 3-line balanced entry                   → accepted.
-- The deferral is tested inside the transaction via SET CONSTRAINTS ...
-- IMMEDIATE, which fires the deferred checks on demand so the assertions are
-- self-contained (no dependency on a failing COMMIT). The whole script
-- ROLLBACKs at the end. Synthetic year 9999.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school UUID; v_profile UUID; v_je UUID; v_entry_no TEXT;
  v_a1010 UUID; v_a1110 UUID;
  v_msg TEXT; v_err BOOLEAN;
BEGIN
  SELECT id INTO v_school FROM schools ORDER BY created_at DESC LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'FAILED setup: no school'; END IF;
  SELECT id INTO v_profile FROM profiles WHERE school_id = v_school LIMIT 1;

  SELECT id INTO v_a1010 FROM chart_of_accounts WHERE school_id = v_school AND code = '1010';
  IF v_a1010 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1010', 'Petty Cash', 'asset', 'Cash & Bank') RETURNING id INTO v_a1010;
  END IF;
  SELECT id INTO v_a1110 FROM chart_of_accounts WHERE school_id = v_school AND code = '1110';
  IF v_a1110 IS NULL THEN
    INSERT INTO chart_of_accounts (school_id, code, name, type, category)
    VALUES (v_school, '1110', 'Student Fee Receivables', 'asset', 'Accounts Receivable') RETURNING id INTO v_a1110;
  END IF;

  -- ── A. balanced 2-line posted █ ──────────────────────────────────────────
  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST balanced A', 'manual', 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je, v_a1010, 100, 0), (v_je, v_a1110, 0, 100);
  SET CONSTRAINTS ALL IMMEDIATE;   -- fires the deferred check now
  RAISE NOTICE 'PASS A: balanced 2-line entry accepted';

  -- ── B. unbalanced posted entry █ must be rejected ────────────────────────
  v_err := false;
  BEGIN
    v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
    INSERT INTO journal_entries
      (school_id, entry_no, entry_date, description, source, status, created_by, posted_by, posted_at)
    VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST unbalanced B', 'manual', 'posted', v_profile, v_profile, now())
    RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je, v_a1010, 100, 0), (v_je, v_a1110, 0, 90);
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_err := true;
      v_msg := SQLERRM;
  END;
  IF NOT v_err THEN RAISE EXCEPTION 'FAILED B: unbalanced entry was NOT rejected'; END IF;
  IF position('unbalanced' in v_msg) = 0 THEN RAISE EXCEPTION 'FAILED B: unexpected error message: %', v_msg; END IF;
  RAISE NOTICE 'PASS B: unbalanced entry rejected against tolerance 0.00';

  -- ── C. balanced draft → UPDATE to posted █ ───────────────────────────────
  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, status, created_by)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST draft C', 'manual', 'draft', v_profile)
  RETURNING id INTO v_je;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je, v_a1010, 250, 0), (v_je, v_a1110, 0, 250);
  UPDATE journal_entries SET status = 'posted', posted_by = v_profile, posted_at = now() WHERE id = v_je;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS C: balanced draft→posted accepted';

  -- ── D. unbalanced draft → UPDATE to posted █ must be rejected ────────────
  v_err := false;
  BEGIN
    v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
    INSERT INTO journal_entries
      (school_id, entry_no, entry_date, description, source, status, created_by)
    VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST draft D', 'manual', 'draft', v_profile)
    RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je, v_a1010, 300, 0), (v_je, v_a1110, 0, 275);
    UPDATE journal_entries SET status = 'posted', posted_by = v_profile, posted_at = now() WHERE id = v_je;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN v_err := true;
  END;
  IF NOT v_err THEN RAISE EXCEPTION 'FAILED D: unbalanced draft→posted NOT rejected'; END IF;
  RAISE NOTICE 'PASS D: unbalanced draft→posted rejected';

  -- ── E. balanced 3-line entry █ ───────────────────────────────────────────
  v_entry_no := public.next_journal_number(v_school, to_char(CURRENT_DATE, 'YY')::int);
  INSERT INTO journal_entries
    (school_id, entry_no, entry_date, description, source, status, created_by, posted_by, posted_at)
  VALUES (v_school, v_entry_no, CURRENT_DATE, 'AUTOTEST balanced E', 'manual', 'posted', v_profile, v_profile, now())
  RETURNING id INTO v_je;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je, v_a1010, 5000, 0), (v_je, v_a1110, 0, 3000), (v_je, v_a1110, 0, 2000);
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS E: balanced 3-line entry accepted';

  RAISE NOTICE 'ALL 129 TESTS PASSED — transaction ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;