-- ============================================================================
-- 126_cheque_lifecycle.sql
-- FINANCE HARDENING — ITEM 3: real cheque lifecycle
-- ============================================================================
-- One RPC drives the two cheque transitions:
--
--   * update_cheque_status(payment, 'cleared')
--       - marks the payment cheque_status = 'cleared' and stamps
--         cheque_tracking.clearance_date. NO GL entry is posted on clear:
--         the receipt was already booked Dr 1020 (Cash at Bank) at record
--         time via METHOD_ACCOUNT_CODE, so a second entry would double-book.
--         (Decision confirmed by the client on 125-follow-up.)
--
--   * update_cheque_status(payment, 'bounced')
--       - runs the full reverse_fee_payment() path (opposite GL, negative
--         student_ledger rows, credit-ledger reversal, audit) and records
--         the bounce on the cheque_tracking row.
--
-- The RPC is SECURITY DEFINER, guard_school_access() first, and only
-- accepts cheque payments that are still in a reversible state.
--
-- UI surfaces: 'Mark cleared' / 'Mark bounced' context-menu actions added to
-- the two existing payment lists (Finance/Payments.jsx and the fees
-- DashboardTab.jsx) — same surface as Reverse. Safe to re-run.
-- ============================================================================

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
  v_pay         public.fee_payments%ROWTYPE;
  v_prev        TEXT;
  v_reverse     JSONB;
  v_track       INT;
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
      jsonb_build_object('payment_id', p_payment_id, 'receipt', v_pay.receipt_number),
      p_user_id
    );

    RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'status', 'cleared');
  END IF;

  -- p_new_status = 'bounced' → full financial reversal
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
-- Exposure: authenticated web app users only.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_cheque_status(uuid, text, uuid, text) TO authenticated;