-- ============================================================================
-- 131_cheque_status_check_fix.sql
-- FINANCE HARDENING — hotfix found by test 125 against live DB
-- ============================================================================
-- reverse_fee_payment (125/130) sets fee_payments.cheque_status = 'reversed'
-- on EVERY reversal (judgment call documented in 125). But fee_payments was
-- created outside these migrations (base schema), where cheque_status carried
-- a column-level CHECK fee_payments_cheque_status_check that predates
-- reversals — the value list did NOT include 'reversed', so the reversal
-- UPDATE violated the constraint and the whole reversal txn aborted.
--
-- Fix: drop ONLY the column-level CHECK constraints on cheque_status (located
-- precisely via pg_constraint.conkey so multi-column checks are never
-- touched) and re-add a widened list that includes every status this finance
-- stack writes: pending / cleared / bounced / reversed / refunded / voided.
-- Same pattern as migration 125 used for student_credit_transactions.type.
--
-- Safe to re-run.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.fee_payments'::regclass
      AND c.contype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND (SELECT attname FROM pg_attribute
           WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = 'cheque_status'
  LOOP
    EXECUTE format('ALTER TABLE public.fee_payments DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.fee_payments
    ADD CONSTRAINT fee_payments_cheque_status_check
    CHECK (cheque_status IN ('pending', 'cleared', 'bounced', 'reversed', 'refunded', 'voided'));
END;
$$;