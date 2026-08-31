-- ============================================================================
-- 127_duplicate_payment_guard.sql
-- FINANCE HARDENING — ITEM 4: DB-side duplicate payment guard
-- ============================================================================
-- record_fee_payment() now detects repeat submissions the instant they hit the
-- server, so a double-click / retry can never double-record money:
--
--   Same school + student + amount + payment_type + term + year +
--   transaction_date, SAME reference, and created within the last 60 seconds
--   → return the EXISTING payment (success:true, duplicate:true) and write
--   nothing new. This is idempotent, not a hard failure.
--
-- Improvements over the old client-only check (Finance/Payments.jsx, which
-- matched only student/amount/date/term and therefore produced false
-- positives across discrete transactions recorded the same day):
--   * reference is compared too (M-Pesa code / cheque number);
--   * NULL references compare equal only to NULL (cash receipts);
--   * the 60s window replaces the whole day.
--
-- The client (usePayments.js) is updated to bail out when duplicate:true is
-- returned so it skips the follow-up cheque/receipt/GL writes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_school_id UUID,
  p_student_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_payment_method TEXT,
  p_provider TEXT,
  p_reference TEXT,
  p_receipt_number TEXT,
  p_received_by UUID,
  p_transaction_date DATE,
  p_term TEXT,
  p_year INT,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_remaining  NUMERIC;
  v_out        NUMERIC;
  v_applied    NUMERIC;
  v_alloc      JSONB := '[]'::jsonb;
  v_balance    NUMERIC;
  v_ledger_id  UUID;
  v_term       TEXT;
  v_dup_id     UUID;
  v_dup_credit NUMERIC;
  v_dup_receipt TEXT;
BEGIN
  PERFORM public.guard_school_access(p_school_id);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than 0.');
  END IF;

  -- ── Duplicate guard (idempotent) ─────────────────────────────────────────
  SELECT d.id, COALESCE(d.receipt_number, '')
  INTO v_dup_id, v_dup_receipt
  FROM fee_payments d
  WHERE d.school_id        = p_school_id
    AND d.student_id       = p_student_id
    AND d.amount           = p_amount
    AND d.payment_type     = p_payment_type
    AND d.term             = p_term
    AND d.year             = p_year
    AND d.transaction_date = p_transaction_date
    AND d.created_at       > now() - interval '60 seconds'
    AND d.reference IS NOT DISTINCT FROM p_reference
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_dup_credit
    FROM student_credit_transactions
    WHERE payment_id = v_dup_id AND type = 'credit';

    SELECT COALESCE(jsonb_agg(
             jsonb_build_object('term', l.term, 'year', l.year, 'applied', l.amount)
             ORDER BY l.term), '[]'::jsonb)
    INTO v_alloc
    FROM student_ledger l
    WHERE l.reference_id = v_dup_id AND l.entry_type = 'payment' AND l.amount > 0;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'payment_id', v_dup_id,
      'receipt_number', v_dup_receipt,
      'amount', p_amount,
      'applied_amount', p_amount - v_dup_credit,
      'credit_amount', v_dup_credit,
      'allocations', v_alloc
    );
  END IF;

  -- 1. Record the payment in full (source of truth for money received)
  INSERT INTO fee_payments (
    school_id, student_id, amount, payment_type, payment_method,
    provider, reference, receipt_number, received_by,
    transaction_date, term, year
  ) VALUES (
    p_school_id, p_student_id, p_amount, p_payment_type, p_payment_method,
    p_provider, p_reference, p_receipt_number, p_received_by,
    p_transaction_date, p_term, p_year
  )
  RETURNING id INTO v_payment_id;

  -- 2. Auto-allocate: selected term first, then other current-year terms in
  --    term order (Term 1 → 2 → 3), remainder → student credit.
  v_remaining := p_amount;

  FOR v_term IN
    SELECT name FROM (
      SELECT 'Term 1'::TEXT AS name, 1 AS ord UNION ALL
      SELECT 'Term 2', 2 UNION ALL
      SELECT 'Term 3', 3
    ) trm
    ORDER BY (trm.name = p_term)::INT DESC, trm.ord ASC
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;

    v_out := student_term_outstanding(p_school_id, p_student_id, v_term, p_year);
    IF v_out > 0 THEN
      v_applied := LEAST(v_remaining, v_out);

      INSERT INTO student_ledger (
        school_id, student_id, entry_type, amount, term, year, description, reference_id
      ) VALUES (
        p_school_id, p_student_id, 'payment', v_applied, v_term, p_year, p_description, v_payment_id
      )
      RETURNING id INTO v_ledger_id;

      v_remaining := v_remaining - v_applied;
      v_alloc := v_alloc || jsonb_build_array(
        jsonb_build_object('term', v_term, 'year', p_year, 'applied', v_applied)
      );
    END IF;
  END LOOP;

  -- 3. Remainder is held as student credit
  IF v_remaining > 0 THEN
    v_balance := student_credit_balance(p_school_id, p_student_id);
    INSERT INTO student_credit_transactions (
      school_id, student_id, type, amount, balance, payment_id, entry_date,
      description, created_by
    ) VALUES (
      p_school_id, p_student_id, 'credit', v_remaining, v_balance + v_remaining,
      v_payment_id, p_transaction_date,
      'Excess payment — ' || COALESCE(p_receipt_number, 'receipt') || ' — held as student credit',
      p_received_by
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'receipt_number', p_receipt_number,
    'amount', p_amount,
    'applied_amount', p_amount - v_remaining,
    'credit_amount', v_remaining,
    'allocations', v_alloc
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Exposure unchanged: authenticated web app users only (record_fee_payment was
-- already scoped correctly by 123/124; re-assert to be re-run safe).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_fee_payment(uuid, uuid, numeric, text, text, text, text, text, uuid, date, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_fee_payment(uuid, uuid, numeric, text, text, text, text, text, uuid, date, text, int, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.record_fee_payment(uuid, uuid, numeric, text, text, text, text, text, uuid, date, text, int, text) TO authenticated;