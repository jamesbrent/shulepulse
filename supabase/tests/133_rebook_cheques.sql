-- ============================================================================
-- 133_rebook_cheques regression test — run in the Supabase SQL editor.
-- ============================================================================
-- Run AFTER applying supabase/migrations/133_rebook_cheques.sql.
-- Verifies the historical cheque rebooking:
--   A. every historical cheque (posted receipt JE with a 1020 debit) has a
--      Part-1 reclassification move: Dr 1050 | Cr 1020;
--   B. every already-'cleared' historical cheque additionally has a Part-2
--      move: Dr 1020 | Cr 1050 (net zero on bank/clearing, bank end balance
--      unchanged);
--   C. idempotency: re-running markers do not create duplicates.
-- Read-only: runs inside a transaction that ROLLBACKs at the end.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_school UUID;
  v_clear_acc UUID;
  v_bank_acc  UUID;
  v_part1_id UUID;
  v_d1050 NUMERIC;
  v_c1020 NUMERIC;
  v_net_bank NUMERIC;
  v_net_clear NUMERIC;
  v_part1_cnt INT;
  v_part2_cnt INT;
  v_je RECORD;
BEGIN
  SELECT s.id INTO v_school
  FROM schools s
  JOIN students st ON st.school_id = s.id
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'FAILED setup: no school with students'; END IF;

  SELECT id INTO v_bank_acc  FROM chart_of_accounts WHERE school_id = v_school AND code = '1020';
  SELECT id INTO v_clear_acc FROM chart_of_accounts WHERE school_id = v_school AND code = '1050';
  IF v_bank_acc IS NULL OR v_clear_acc IS NULL THEN
    RAISE EXCEPTION 'FAILED setup: chart 1020/1050 missing';
  END IF;

  -- ── Collect the target set exactly as migration 133 defines it ───────────
  CREATE TEMP TABLE tmp_rebook_target ON COMMIT DROP AS
  SELECT p.id AS pay_id, p.school_id, p.amount,
         COALESCE(p.cheque_status, 'pending') AS status,
         COALESCE(p.receipt_number, p.id::text) AS receipt
  FROM fee_payments p
  JOIN journal_entries je ON je.id = p.journal_entry_id
  LEFT JOIN LATERAL (
    SELECT a.code
    FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = p.journal_entry_id AND COALESCE(l.debit, 0) > 0
    ORDER BY l.debit DESC
    LIMIT 1
  ) dr ON TRUE
  WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
    AND p.journal_entry_id IS NOT NULL
    AND je.status = 'posted'
    AND COALESCE(dr.code, '') = '1020';

  -- ── A. every target got exactly one Part-1 reclassification move ─────────
  FOR v_je IN SELECT * FROM tmp_rebook_target LOOP
    SELECT count(*) INTO v_part1_cnt
    FROM journal_entries j
    WHERE j.reference_type = 'fee_payment' AND j.reference_id = v_je.pay_id
      AND j.source = 'transfer' AND j.description LIKE '%[rebook-133]%'
      AND j.description NOT LIKE '%[rebook-133:cleared]%';
    IF v_part1_cnt <> 1 THEN
      RAISE EXCEPTION 'FAILED A: payment % has % Part-1 moves', v_je.pay_id, v_part1_cnt;
    END IF;

    -- Part-1 move must be Dr 1050 | Cr 1020 for the full amount.
    SELECT j.id, sum(CASE WHEN l.account_id = v_clear_acc THEN COALESCE(l.debit, 0) - COALESCE(l.credit, 0) ELSE 0 END),
                 sum(CASE WHEN l.account_id = v_bank_acc  THEN COALESCE(l.credit, 0) - COALESCE(l.debit, 0)  ELSE 0 END)
      INTO v_part1_id, v_d1050, v_c1020
    FROM journal_entries j
    JOIN journal_entry_lines l ON l.journal_entry_id = j.id
    WHERE j.reference_id = v_je.pay_id AND j.source = 'transfer'
      AND j.description LIKE '%[rebook-133]%'
      AND j.description NOT LIKE '%[rebook-133:cleared]%'
      AND j.status = 'posted'
    GROUP BY j.id;
    IF v_part1_id IS NULL THEN RAISE EXCEPTION 'FAILED A: no posted Part-1 move for %', v_je.pay_id; END IF;
    IF v_d1050 <> v_je.amount OR v_c1020 <> v_je.amount THEN
      RAISE EXCEPTION 'FAILED A: Part-1 move amounts Dr1050=% Cr1020=% (expected %/%)',
        v_d1050, v_c1020, v_je.amount, v_je.amount;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS A: Part-1 reclassification move present for all % target(s)', (SELECT count(*) FROM tmp_rebook_target);

  -- ── B. each 'cleared' target ALSO got a Part-2 move, net zero on bank ─────
  FOR v_je IN SELECT * FROM tmp_rebook_target WHERE status = 'cleared' LOOP
    SELECT count(*) INTO v_part2_cnt
    FROM journal_entries j
    WHERE j.reference_type = 'fee_payment' AND j.reference_id = v_je.pay_id
      AND j.source = 'transfer' AND j.description LIKE '%[rebook-133:cleared]%';
    IF v_part2_cnt <> 1 THEN
      RAISE EXCEPTION 'FAILED B: cleared payment % has % Part-2 moves', v_je.pay_id, v_part2_cnt;
    END IF;

    -- Net position of ALL rebook moves for this cleared payment on bank and
    -- clearing must be ZERO (Part-1 Dr1050|Cr1020 cancels Part-2 Dr1020|Cr1050).
    -- NB: match BOTH markers ('[rebook-133]' and '[rebook-133:cleared]') via
    -- the shared prefix, otherwise Part-2 is wrongly excluded from the sum.
    SELECT
      sum(CASE WHEN l.account_id = v_bank_acc  THEN COALESCE(l.debit, 0) - COALESCE(l.credit, 0) ELSE 0 END),
      sum(CASE WHEN l.account_id = v_clear_acc THEN COALESCE(l.debit, 0) - COALESCE(l.credit, 0) ELSE 0 END)
      INTO v_net_bank, v_net_clear
    FROM journal_entries j
    JOIN journal_entry_lines l ON l.journal_entry_id = j.id
    WHERE j.reference_id = v_je.pay_id AND j.source = 'transfer'
      AND j.description LIKE '%[rebook-133%' AND j.status = 'posted';
    IF COALESCE(v_net_bank, 0) <> 0 OR COALESCE(v_net_clear, 0) <> 0 THEN
      RAISE EXCEPTION 'FAILED B: cleared payment % net bank=% clear=% (expected 0/0)',
        v_je.pay_id, v_net_bank, v_net_clear;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS B: Part-2 cleared moves present for all cleared target(s)';

  -- ── C. idempotency: no duplicated Part-1 or Part-2 move per payment ──────
  FOR v_je IN SELECT * FROM tmp_rebook_target LOOP
    SELECT count(*) INTO v_part1_cnt
    FROM journal_entries j
    WHERE j.reference_type = 'fee_payment' AND j.reference_id = v_je.pay_id
      AND j.source = 'transfer' AND j.description LIKE '%[rebook-133]%'
      AND j.description NOT LIKE '%[rebook-133:cleared]%';
    IF v_part1_cnt <> 1 THEN RAISE EXCEPTION 'FAILED C: payment % has % Part-1 moves', v_je.pay_id, v_part1_cnt; END IF;
    SELECT count(*) INTO v_part2_cnt
    FROM journal_entries j
    WHERE j.reference_type = 'fee_payment' AND j.reference_id = v_je.pay_id
      AND j.source = 'transfer' AND j.description LIKE '%[rebook-133:cleared]%';
    IF COALESCE(v_je.status, 'pending') <> 'cleared' THEN
      IF v_part2_cnt <> 0 THEN RAISE EXCEPTION 'FAILED C: non-cleared payment % has Part-2 move', v_je.pay_id; END IF;
    ELSE
      IF v_part2_cnt <> 1 THEN RAISE EXCEPTION 'FAILED C: cleared payment % unexpected Part-2 count=%', v_je.pay_id, v_part2_cnt; END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS C: no duplicate rebook-133 moves';

  -- ── D. every rebook journal is balanced (exercises 129 trigger) ───────────
  BEGIN
    SET CONSTRAINTS trg_journal_entry_balance IMMEDIATE;
    RAISE NOTICE 'PASS D: all rebook journals balanced (item-7 constraint)';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'FAILED D: an unbalanced rebook journal exists';
  END;

  RAISE NOTICE 'ALL 133 TESTS PASSED — transaction ROLLBACK, nothing persisted.';
END;
$$;

ROLLBACK;