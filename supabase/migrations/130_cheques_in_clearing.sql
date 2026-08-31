-- ============================================================================
-- 130_cheques_in_clearing.sql
-- FINANCE HARDENING — ITEM 3 closure: real cheque-clearing bucket
-- ============================================================================
-- Client-confirmed decision (option 1): introduce a genuine suspense account
-- so 'cleared' moves money instead of being cosmetic.
--
-- BEFORE this migration there was NO clearing account anywhere in the chart
-- (1010 = Petty Cash, 1020 = Cash at Bank (Main), 1030 = Mobile Money,
-- 1040 = Bank — Fixed Deposit). Cheque receipts were booked Dr 1020 Cr 1110
-- at record time, so funds sat in the main bank before physical clearance.
--
-- Design after this migration (none of this rebooks history):
--
--   1. New account 1050 'Cheques in Clearing' (asset, Cash & Bank), seeded
--      into every school.
--   2. Record time (client postFeePaymentToGL): cheque receipts now book
--      Dr 1050 | Cr 1110/2230. Bank and other methods are unchanged
--      ('bank' legitimately books into 1020 immediately).
--   3. On 'cleared' (update_cheque_status): posts Dr 1020 | Cr 1050 so the
--      money lands in the bank the moment it is real. The move is a posted
--      'transfer'-source journal entry linked to the payment.
--   4. On 'bounced': the EXISTING reverse_fee_payment RPC runs unchanged —
--      it now also reverses any linked cheque-clearing move entry, so a
--      cleared-then-bounced cheque returns every balance to zero (no second
--      bounce-specific path).
--
-- Historical rebooking (if approved after the 131 dry-run) is a SEPARATE
-- later migration. This file ONLY changes forward behavior.
--
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed 1050 'Cheques in Clearing' into every school's chart.
-- ----------------------------------------------------------------------------
INSERT INTO public.chart_of_accounts (school_id, code, name, type, category)
SELECT s.id, '1050', 'Cheques in Clearing', 'asset', 'Cash & Bank'
FROM public.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts a
  WHERE a.school_id = s.id AND a.code = '1050'
);

-- ----------------------------------------------------------------------------
-- 2. Rebuild update_cheque_status with the clearing->bank move on 'cleared'.
--    Same signature, same guard/status rules as 126; the cleared branch now
--    also posts Dr <1020 Cash at Bank> | Cr <1050 Cheques in Clearing>.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_cheque_status(
  p_payment_id UUID,
  p_new_status TEXT,
  p_user_id    UUID,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay          public.fee_payments%ROWTYPE;
  v_prev         TEXT;
  v_reverse      JSONB;
  v_track        INT;
  v_bank_acc     public.chart_of_accounts%ROWTYPE;
  v_clear_acc    public.chart_of_accounts%ROWTYPE;
  v_clear_je     UUID;
  v_entry_no     TEXT;
BEGIN
  SELECT * INTO v_pay FROM public.fee_payments WHERE id = p_payment_id;
  IF v_pay.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found.');
  END IF;

  PERFORM public.guard_school_access(v_pay.school_id);

  -- Only cheque-classed payments are valid targets.
  IF COALESCE(v_pay.payment_type, '') NOT IN ('cheque', 'bank')
     AND COALESCE(v_pay.payment_method, '') NOT IN ('cheque', 'bank')
     AND v_pay.cheque_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a cheque payment.');
  END IF;

  IF p_new_status NOT IN ('cleared', 'bounced') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be cleared or bounced.');
  END IF;

  SELECT count(*) INTO v_track FROM public.cheque_tracking WHERE payment_id = p_payment_id;

  v_prev := COALESCE(v_pay.cheque_status, 'pending');
  IF v_prev = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'already', v_prev);
  END IF;
  IF v_prev IN ('reversed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment has already been reversed or refunded.');
  END IF;

  IF p_new_status = 'cleared' THEN
    -- Financial move: cheques now live in Clearing until they actually clear,
    -- then Dr Cash at Bank (Main) | Cr Cheques in Clearing.
    SELECT * INTO v_bank_acc  FROM public.chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1020';
    SELECT * INTO v_clear_acc FROM public.chart_of_accounts WHERE school_id = v_pay.school_id AND code = '1050';
    IF v_bank_acc.id IS NULL OR v_clear_acc.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bank or clearing account missing from the chart.');
    END IF;

    v_entry_no := public.next_journal_number(
      v_pay.school_id,
      to_char(CURRENT_DATE, 'YY')::INT
    );
    INSERT INTO public.journal_entries (
      school_id, entry_no, entry_date, description, source,
      reference_type, reference_id, status, created_by, posted_by, posted_at
    ) VALUES (
      v_pay.school_id,
      v_entry_no,
      CURRENT_DATE,
      'Cheque cleared — receipt ' || COALESCE(v_pay.receipt_number, v_pay.id::text) || ' moved to bank',
      'transfer',
      'fee_payment',
      p_payment_id,
      'posted',
      p_user_id,
      p_user_id,
      now()
    )
    RETURNING id INTO v_clear_je;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, notes)
    VALUES
      (v_clear_je, v_bank_acc.id,  v_pay.amount, 0, 'Cheque cleared into bank — receipt ' || COALESCE(v_pay.receipt_number, '')),
      (v_clear_je, v_clear_acc.id, 0, v_pay.amount, 'Cheque cleared out of clearing — receipt ' || COALESCE(v_pay.receipt_number, ''));

    UPDATE public.fee_payments
      SET cheque_status = 'cleared', updated_at = now()
      WHERE id = p_payment_id;

    IF v_track > 0 THEN
      UPDATE public.cheque_tracking
        SET status = 'cleared',
            clearance_date = CURRENT_DATE,
            notes = CASE WHEN COALESCE(p_note, '') = '' THEN notes
                         ELSE COALESCE(notes, '') || ' | Cleared: ' || p_note END
        WHERE payment_id = p_payment_id;
    END IF;

    INSERT INTO public.audit_logs (school_id, action, details, performed_by)
    VALUES (
      v_pay.school_id,
      'cheque_cleared',
      jsonb_build_object('payment_id', p_payment_id, 'receipt', v_pay.receipt_number, 'journal_id', v_clear_je),
      p_user_id
    );

    RETURN jsonb_build_object(
      'success', true, 'payment_id', p_payment_id, 'status', 'cleared',
      'journal_id', v_clear_je, 'bank_account', v_bank_acc.code, 'clearing_account', v_clear_acc.code
    );
  END IF;

  -- p_new_status = 'bounced' → full financial reversal (single RPC path).
  v_reverse := public.reverse_fee_payment(
    p_payment_id,
    p_user_id,
    COALESCE(NULLIF(p_note, ''), 'Cheque bounced'),
    CURRENT_DATE
  );
  IF (v_reverse->>'success')::boolean IS NOT TRUE THEN
    RETURN v_reverse;
  END IF;

  IF v_track > 0 THEN
    UPDATE public.cheque_tracking
      SET status = 'bounced',
          notes = CASE WHEN COALESCE(p_note, '') = '' THEN notes
                       ELSE COALESCE(notes, '') || ' | Bounced: ' || p_note END
      WHERE payment_id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'status', 'bounced',
    'reversal', v_reverse
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Rebuild reverse_fee_payment: besides the receipt journal, also reverse
--    any linked posted 'transfer' journal entries for this payment (the
--    cheque-clearing move). Required so a cleared→bounced cheque undoes the
--    Dr Bank | Cr Clearing move as well as the receipt.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_fee_payment(
  p_payment_id UUID,
  p_user_id    UUID,
  p_reason     TEXT DEFAULT NULL,
  p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay           public.fee_payments%ROWTYPE;
  v_je            public.journal_entries%ROWTYPE;
  v_je_line       RECORD;
  v_ledger_row    RECORD;
  v_credit_txn    RECORD;
  v_move          public.journal_entries%ROWTYPE;
  v_move_rev_je   UUID;
  v_reversal_je   UUID;
  v_entry_no      TEXT;
  v_balance       NUMERIC;
  v_ledger_total  NUMERIC := 0;
  v_credit_total  NUMERIC := 0;
  v_prev_status   TEXT;
  v_receipt_label TEXT;
  v_move_reversals JSONB := '[]'::jsonb;
BEGIN
  -- 0. Resolve the payment and enforce the school guard first.
  SELECT * INTO v_pay FROM public.fee_payments WHERE id = p_payment_id;
  IF v_pay.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found.');
  END IF;

  PERFORM public.guard_school_access(v_pay.school_id);

  v_prev_status := COALESCE(v_pay.cheque_status, 'completed');
  IF v_prev_status IN ('reversed', 'refunded', 'voided') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment has already been reversed or refunded.');
  END IF;

  v_receipt_label := COALESCE(v_pay.receipt_number, v_pay.id::text);

  -- 1. (a) Opposite GL entry — only when the original was actually posted.
  IF v_pay.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_je FROM public.journal_entries WHERE id = v_pay.journal_entry_id;
    IF v_je.id IS NOT NULL AND v_je.status = 'posted' THEN
      v_entry_no := public.next_journal_number(
        v_pay.school_id,
        to_char(CURRENT_DATE, 'YY')::INT
      );

      INSERT INTO public.journal_entries (
        school_id, entry_no, entry_date, description, source,
        reference_type, reference_id, status, created_by, posted_by, posted_at
      ) VALUES (
        v_pay.school_id,
        v_entry_no,
        p_entry_date,
        'Reversal of ' || v_je.entry_no || ' — ' || COALESCE(p_reason, 'fee payment reversal'),
        v_je.source,
        v_je.reference_type,
        v_je.reference_id,
        'posted',
        p_user_id,
        p_user_id,
        now()
      )
      RETURNING id INTO v_reversal_je;

      -- Swap debit/credit on every original line (same rule as reverseJournal).
      FOR v_je_line IN
        SELECT account_id, debit, credit, notes
        FROM public.journal_entry_lines
        WHERE journal_entry_id = v_je.id
      LOOP
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit, credit, notes
        ) VALUES (
          v_reversal_je,
          v_je_line.account_id,
          COALESCE(v_je_line.credit, 0),
          COALESCE(v_je_line.debit, 0),
          'Reversal of ' || v_je.entry_no || COALESCE(' — ' || v_je_line.notes, '')
        );
      END LOOP;

      UPDATE public.journal_entries
        SET status = 'reversed',
            reversed_by = p_user_id,
            reversal_of = v_reversal_je
        WHERE id = v_je.id;
    END IF;
  END IF;

  -- 1. (a2) Also reverse any linked posted 'transfer' move entries (e.g. the
  --    cheque-clearing Dr Bank | Cr Clearing) so bouncing a cleared cheque
  --    returns every balance to zero.
  FOR v_move IN
    SELECT *
    FROM public.journal_entries
    WHERE reference_type = 'fee_payment'
      AND reference_id = p_payment_id
      AND source = 'transfer'
      AND status = 'posted'
      AND id <> v_pay.journal_entry_id
  LOOP
    v_entry_no := public.next_journal_number(
      v_pay.school_id,
      to_char(CURRENT_DATE, 'YY')::INT
    );
    INSERT INTO public.journal_entries (
      school_id, entry_no, entry_date, description, source,
      reference_type, reference_id, status, created_by, posted_by, posted_at
    ) VALUES (
      v_pay.school_id,
      v_entry_no,
      p_entry_date,
      'Reversal of ' || v_move.entry_no || ' — ' || COALESCE(p_reason, 'cheque clearing move reversed'),
      'transfer',
      'fee_payment',
      p_payment_id,
      'posted',
      p_user_id,
      p_user_id,
      now()
    )
    RETURNING id INTO v_move_rev_je;

    FOR v_je_line IN
      SELECT account_id, debit, credit, notes
      FROM public.journal_entry_lines
      WHERE journal_entry_id = v_move.id
    LOOP
      INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, debit, credit, notes
      ) VALUES (
        v_move_rev_je,
        v_je_line.account_id,
        COALESCE(v_je_line.credit, 0),
        COALESCE(v_je_line.debit, 0),
        'Reversal of ' || v_move.entry_no || COALESCE(' — ' || v_je_line.notes, '')
      );
    END LOOP;

    UPDATE public.journal_entries
      SET status = 'reversed',
          reversed_by = p_user_id,
          reversal_of = v_move_rev_je
      WHERE id = v_move.id;

    v_move_reversals := v_move_reversals || jsonb_build_array(
      jsonb_build_object('move_journal_id', v_move.id, 'reversal_journal_id', v_move_rev_je)
    );
  END LOOP;

  -- 2. (b) Negative student_ledger rows mirroring the original allocation.
  FOR v_ledger_row IN
    SELECT school_id, student_id, amount, term, year
    FROM public.student_ledger
    WHERE reference_id = p_payment_id
      AND entry_type = 'payment'
      AND amount > 0
  LOOP
    INSERT INTO public.student_ledger (
      school_id, student_id, entry_type, amount, term, year, description, reference_id
    ) VALUES (
      v_ledger_row.school_id,
      v_ledger_row.student_id,
      'payment',
      -v_ledger_row.amount,
      v_ledger_row.term,
      v_ledger_row.year,
      'Reversal of payment ' || v_receipt_label || COALESCE(' — ' || p_reason, ''),
      p_payment_id
    );
    v_ledger_total := v_ledger_total + COALESCE(v_ledger_row.amount, 0);
  END LOOP;

  -- Legacy fallback: payments recorded before reference_id was populated.
  IF v_ledger_total <= 0 AND v_pay.term IS NOT NULL AND v_pay.year IS NOT NULL THEN
    INSERT INTO public.student_ledger (
      school_id, student_id, entry_type, amount, term, year, description, reference_id
    ) VALUES (
      v_pay.school_id,
      v_pay.student_id,
      'payment',
      -v_pay.amount,
      v_pay.term,
      v_pay.year,
      'Reversal of payment ' || v_receipt_label,
      p_payment_id
    );
    v_ledger_total := COALESCE(v_pay.amount, 0);
  END IF;

  -- 3. (c) Reverse any excess credit this payment created.
  FOR v_credit_txn IN
    SELECT amount
    FROM public.student_credit_transactions
    WHERE payment_id = p_payment_id AND type = 'credit' AND amount > 0
  LOOP
    v_balance := public.student_credit_balance(v_pay.school_id, v_pay.student_id);
    INSERT INTO public.student_credit_transactions (
      school_id, student_id, type, amount, balance, payment_id, entry_date,
      description, created_by
    ) VALUES (
      v_pay.school_id,
      v_pay.student_id,
      'reversal',
      v_credit_txn.amount,
      v_balance - v_credit_txn.amount,
      p_payment_id,
      p_entry_date,
      'Reversal of payment ' || v_receipt_label || ' — excess credit returned',
      p_user_id
    );
    v_credit_total := v_credit_total + COALESCE(v_credit_txn.amount, 0);
  END LOOP;

  -- 4. (d) Reflect the status on any cheque tracking row, then mark original.
  UPDATE public.cheque_tracking
    SET status = 'reversed'
    WHERE payment_id = p_payment_id;

  UPDATE public.fee_payments
    SET cheque_status = 'reversed', updated_at = now()
    WHERE id = p_payment_id;

  -- 5. Immutable audit trail.
  INSERT INTO public.audit_logs (school_id, action, details, performed_by)
  VALUES (
    v_pay.school_id,
    'fee_payment_reversed',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'receipt', v_pay.receipt_number,
      'amount', v_pay.amount,
      'reason', p_reason,
      'ledger_reversed', v_ledger_total,
      'credit_reversed', v_credit_total,
      'journal_id', v_reversal_je,
      'move_reversals', v_move_reversals
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'reversal_journal_id', v_reversal_je,
    'move_reversals', v_move_reversals,
    'ledger_reversed', v_ledger_total,
    'credit_reversed', v_credit_total
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------------------
-- Exposure: authenticated web app users only (both rebuilt functions).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) TO authenticated;