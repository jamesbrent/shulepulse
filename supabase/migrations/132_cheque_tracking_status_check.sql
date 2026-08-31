-- ============================================================================
-- 132_cheque_tracking_status_check.sql
-- FINANCE HARDENING — live-DB hotfix #2 (found by test 125 scenario B)
-- ============================================================================
-- Same root cause as 131: cheque_tracking lives in the base schema (created
-- outside these migrations) and its column CHECK cheque_tracking_status_check
-- predates the reversal feature. reverse_fee_payment (125/130) writes
-- cheque_tracking.status = 'reversed' on reversal of a cheque payment; the base
-- CHECK only knew pending/cleared/bounced, so the UPDATE aborted with
-- 'cheque_tracking_status_check' violation.
--
-- Widens the column-level CHECK on cheque_tracking.status to the full set the
-- finance stack writes: pending / cleared / bounced / reversed / refunded /
-- voided. Same precise conkey-based drop as 131 so no multi-column check is
-- ever touched. Safe to re-run.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cheque_tracking'::regclass
      AND c.contype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND (SELECT attname FROM pg_attribute
           WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.cheque_tracking DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.cheque_tracking
    ADD CONSTRAINT cheque_tracking_status_check
    CHECK (status IN ('pending', 'cleared', 'bounced', 'reversed', 'refunded', 'voided'));
END;
$$;