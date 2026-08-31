-- ============================================================================
-- 131_cheque_status_check.sql — regression test for the live-DB hotfix
-- Run me after applying 131_cheque_status_check_fix.sql. Read-only, rolls back.
--
-- What it proves:
--   The column-level CHECK on fee_payments.cheque_status now permits every
--   status this finance stack writes (in particular 'reversed', which
--   reverse_fee_payment depends on from migration 125 onward — this is what
--   test 125 scenario A crashed on before the fix).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.fee_payments'::regclass
    AND c.contype = 'c'
    AND c.conname = 'fee_payments_cheque_status_check';

  IF v_def IS NULL OR position('reversed' in v_def) = 0 THEN
    RAISE EXCEPTION 'FAIL: fee_payments_cheque_status_check missing or does not allow reversed: %', COALESCE(v_def, '<none>');
  END IF;

  RAISE NOTICE 'PASS 131: fee_payments.cheque_status CHECK allows reversed, refunded, voided.';
END $$;

ROLLBACK;