-- ============================================================================
-- 125_reverse_fee_payment.sql
-- FINANCE HARDENING — ITEM 2: unified payment reversal RPC
-- ============================================================================
-- Reverses a recorded fee payment in one atomic, auditable operation:
--
--   (a) opposite GL entry when the original was posted (reversal is itself
--       posted, so the original effect is fully undone for Trial Balance);
--   (b) negative student_ledger rows mirroring the original allocation,
--       with a fallback to the payment's term/year for legacy payments that
--       never set reference_id (mirrors the old client-side insert);
--   (c) a 'reversal' student_credit_transactions row for any excess credit
--       the payment created (the credit ledger CHECK is extended so the
--       reversal is an audit trail, not a delete);
--   (d) cheque_tracking.status -> 'reversed' when a tracking row exists.
--
-- The original fee_payments row is always marked cheque_status = 'reversed'.
-- The function is SECURITY DEFINER and runs public.guard_school_access()
-- first, so cross-school reversal by the client surface is impossible.
--
-- Replaces the partial client-side reimplementation in both
-- src/pages/Finance/Payments.jsx and
-- src/pages/admin/fees/tabs/DashboardTab.jsx — no reversal logic stays in JS.
--
-- Judgment call (documented): 'reversed' is used for every payment type, not
-- only cheques — the legacy handlers already did this for cash/MPesa too, and
-- Payments.jsx/DashboardTab.jsx statusClass() treats 'reversed'/'refunded' as
-- the same display bucket. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extend the credit-ledger type check so a reversal is recorded (not deleted):
-- credit / debit / refund / reversal. Inline CHECK was auto-named
-- student_credit_transactions_type_check by the SQL engine.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.student_credit_transactions
    DROP CONSTRAINT IF EXISTS student_credit_transactions_type_check;
  ALTER TABLE public.student_credit_transactions
    ADD CONSTRAINT student_credit_transactions_type_check
    CHECK (type IN ('credit', 'debit', 'refund', 'reversal'));
END;
$$;

-- ----------------------------------------------------------------------------
-- reverse_fee_payment(p_payment_id, p_user_id, p_reason, p_entry_date)
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
  v_reversal_je   UUID;
  v_entry_no      TEXT;
  v_balance       NUMERIC;
  v_ledger_total  NUMERIC := 0;
  v_credit_total  NUMERIC := 0;
  v_prev_status   TEXT;
  v_receipt_label TEXT;
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
      'journal_id', v_reversal_je
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'reversal_journal_id', v_reversal_je,
    'ledger_reversed', v_ledger_total,
    'credit_reversed', v_credit_total
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------------------
-- Exposure: authenticated web app users only.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reverse_fee_payment(uuid, uuid, text, date) TO authenticated;