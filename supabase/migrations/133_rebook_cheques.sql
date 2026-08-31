-- ============================================================================
-- 133_rebook_cheques.sql
-- FINANCE HARDENING — ITEM 3 closure: historical cheque rebooking
-- ============================================================================
-- After migration 130, cheque receipts must live in 1050 'Cheques in Clearing'
-- until they clear. Historical cheques recorded BEFORE 130 were booked straight
-- to 1020 'Cash at Bank (Main)' at record time (Dr 1020 | Cr 1110/2230).
--
-- This migration rebooks those records WITHOUT editing the original receipt
-- journal (the codebase treats posted journals as immutable): it posts balanced
-- 'transfer' reclassification journal entries exactly as the 133 dry-run
-- previewed:
--
--   PART 1 (every historical cheque):   Dr 1050  | Cr 1020
--       moves the money from Cash at Bank into Cheques in Clearing so the
--       receipt's receivable (Cr 1110/2230) is fully preserved.
--
--   PART 2 (already-'cleared' cheques): Dr 1020  | Cr 1050
--       the clearing→bank move, so a cleared cheque's money lands back in the
--       bank exactly as update_cheque_status would post at 'cleared' time.
--       For cleared cheques, parts 1+2 cancel to zero → Cash at Bank end
--       balance is UNCHANGED (matches the dry-run note); the net effect is the
--       two-staged accounting shape the new model expects, so any future
--       reverse_fee_payment undoes both moves cleanly.
--
-- Target set (dry-run 133): all historical cheque receipts with a posted
-- journal whose debit line sits on 1020. Anomaly checks returned 0 rows for
-- 'no GL link' and 'debit line not on 1020', so the set is exact.
--
-- Idempotent: guarded by a marker in the journal description ('[rebook-133]'),
-- so re-running never duplicates reclassification moves.
--
-- NOTE: Every journal entry here is balanced, so the 129 deferred balance
-- trigger passes. Execution identity: service/editor role bypasses the school
-- guard (row-level), so this runs as-is from the SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1 — reclassify each historical cheque from Cash at Bank → Clearing.
--          Dr 1050 (Cheques in Clearing)  |  Cr 1020 (Cash at Bank), posted.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_pay RECORD;
  v_clear_acc UUID;
  v_bank_acc  UUID;
  v_je_id     UUID;
  v_entry_no  TEXT;
BEGIN
  FOR v_pay IN
    SELECT p.id, p.school_id, p.amount,
           COALESCE(p.receipt_number, p.id::text) AS receipt,
           p.student_id, p.term, p.year
    FROM fee_payments p
    JOIN journal_entries je ON je.id = p.journal_entry_id
    LEFT JOIN LATERAL (
      SELECT a.id AS acc_id, a.code
      FROM journal_entry_lines l
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE l.journal_entry_id = p.journal_entry_id AND COALESCE(l.debit, 0) > 0
      ORDER BY l.debit DESC
      LIMIT 1
    ) dr ON TRUE
    WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
      AND p.journal_entry_id IS NOT NULL
      AND je.status = 'posted'
      AND COALESCE(dr.code, '') = '1020'
      -- idempotency: only rebook payments that have no rebook-133 marker yet
      AND NOT EXISTS (
        SELECT 1
        FROM journal_entries j2
        WHERE j2.reference_type = 'fee_payment'
          AND j2.reference_id = p.id
          AND j2.source = 'transfer'
          AND j2.description LIKE '%[rebook-133]%'
      )
    ORDER BY p.school_id, p.term, p.year, je.entry_no
  LOOP
    SELECT id INTO v_clear_acc
    FROM chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1050';
    SELECT id INTO v_bank_acc
    FROM chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1020';
    IF v_clear_acc IS NULL OR v_bank_acc IS NULL THEN
      RAISE EXCEPTION 'Rebook 133: chart missing 1050/1020 for school % (payment %)',
        v_pay.school_id, v_pay.id;
    END IF;

    v_entry_no := public.next_journal_number(v_pay.school_id, to_char(CURRENT_DATE, 'YY')::INT);
    INSERT INTO journal_entries (
      school_id, entry_no, entry_date, description, source,
      reference_type, reference_id, status
    ) VALUES (
      v_pay.school_id, v_entry_no, CURRENT_DATE,
      'Rebook 133 (pending/cleared) — receipt ' || v_pay.receipt || ' moved from bank to clearing [rebook-133]',
      'transfer', 'fee_payment', v_pay.id, 'posted'
    )
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
    VALUES
      (v_je_id, v_clear_acc, v_pay.amount, 0, 'Rebook 133 — Dr Cheques in Clearing [rebook-133]'),
      (v_je_id, v_bank_acc,  0, v_pay.amount, 'Rebook 133 — Cr Cash at Bank [rebook-133]');
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- PART 2 — for already-'cleared' historical cheques, post the clearing→bank
--          move so the money returns to the bank: Dr 1020 | Cr 1050, posted.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_pay RECORD;
  v_clear_acc UUID;
  v_bank_acc  UUID;
  v_je_id     UUID;
  v_entry_no  TEXT;
BEGIN
  FOR v_pay IN
    SELECT p.id, p.school_id, p.amount,
           COALESCE(p.receipt_number, p.id::text) AS receipt
    FROM fee_payments p
    JOIN journal_entries je ON je.id = p.journal_entry_id
    WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
      AND p.journal_entry_id IS NOT NULL
      AND je.status = 'posted'
      AND COALESCE(p.cheque_status, 'pending') = 'cleared'
      -- idempotency: only add the cleared move if no rebook-133 "cleared" move yet
      AND NOT EXISTS (
        SELECT 1
        FROM journal_entries j2
        WHERE j2.reference_type = 'fee_payment'
          AND j2.reference_id = p.id
          AND j2.source = 'transfer'
          AND j2.description LIKE '%[rebook-133:cleared]%'
      )
    ORDER BY p.school_id
  LOOP
    SELECT id INTO v_bank_acc
    FROM chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1020';
    SELECT id INTO v_clear_acc
    FROM chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1050';
    IF v_bank_acc IS NULL OR v_clear_acc IS NULL THEN
      RAISE EXCEPTION 'Rebook 133 cleared: chart missing 1050/1020 for school % (payment %)',
        v_pay.school_id, v_pay.id;
    END IF;

    v_entry_no := public.next_journal_number(v_pay.school_id, to_char(CURRENT_DATE, 'YY')::INT);
    INSERT INTO journal_entries (
      school_id, entry_no, entry_date, description, source,
      reference_type, reference_id, status
    ) VALUES (
      v_pay.school_id, v_entry_no, CURRENT_DATE,
      'Rebook 133 (cleared) — receipt ' || v_pay.receipt || ' moved from clearing to bank [rebook-133:cleared]',
      'transfer', 'fee_payment', v_pay.id, 'posted'
    )
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
    VALUES
      (v_je_id, v_bank_acc,  v_pay.amount, 0, 'Rebook 133 — Dr Cash at Bank [rebook-133:cleared]'),
      (v_je_id, v_clear_acc, 0, v_pay.amount, 'Rebook 133 — Cr Cheques in Clearing [rebook-133:cleared]');
  END LOOP;
END;
$$;
