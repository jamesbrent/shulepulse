-- ============================================================================
-- 128_receipts_server_side.sql
-- FINANCE HARDENING — ITEM 5: every fee payment gets a receipts row
-- ============================================================================
-- A server-side AFTER INSERT trigger on fee_payments now writes the receipts
-- row for EVERY payment, regardless of which code path created it (the
-- record_fee_payment RPC, the legacy Finance/Payments.jsx flow, or a raw
-- insert). The old client-side insert (usePayments.js, which silently dropped
-- receipts whenever an RLS/downstream hiccup occurred mid-flow) is removed.
--
-- The trigger reuses the payment's own receipt_number when present (the
-- modern flow generates one atomically up front via next_receipt_number) and
-- falls back to next_receipt_number() for legacy/null receipts, so no payment
-- can ever be left without a receipt row.
--
-- SECURITY DEFINER + SECURITY INVOKER choice:
--   * The trigger function is SECURITY DEFINER so it can call the guarded
--     next_receipt_number() and write past RLS exactly like the payment
--     function itself does. It reads only the NEW row's own fields — no
--     injection surface.
--   * ON CONFLICT DO NOTHING keeps it safe if the migration is re-applied and
--     the table ever grows a unique guard.
--
-- DROP TRIGGER IF EXISTS keeps the migration re-runnable. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_fee_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_receipt TEXT;
BEGIN
  v_receipt := NULLIF(NEW.receipt_number, '');
  IF v_receipt IS NULL THEN
    v_receipt := public.next_receipt_number(NEW.school_id);
  END IF;

  INSERT INTO public.receipts (
    school_id, student_id, payment_id,
    total_amount, receipt_number, term, year
  ) VALUES (
    NEW.school_id, NEW.student_id, NEW.id,
    NEW.amount, v_receipt, NEW.term, NEW.year
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fee_payment_receipt ON public.fee_payments;
CREATE TRIGGER trg_fee_payment_receipt
  AFTER INSERT ON public.fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_fee_payment_receipt();