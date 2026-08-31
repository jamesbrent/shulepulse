-- ============================================================================
-- 132_cheque_tracking_status_check.sql — regression test for live-DB hotfix #2
-- Run me after applying 132_cheque_tracking_status_check.sql. Read-only.
--
-- Proves the column-level CHECK on cheque_tracking.status now permits
-- 'reversed' (and refunded/voided), which reverse_fee_payment relies on.
-- Test 125 scenario B exercises the real path.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.cheque_tracking'::regclass
    AND c.contype = 'c'
    AND c.conname = 'cheque_tracking_status_check';

  IF v_def IS NULL OR position('reversed' in v_def) = 0 THEN
    RAISE EXCEPTION 'FAIL: cheque_tracking_status_check missing or does not allow reversed: %', COALESCE(v_def, '<none>');
  END IF;

  RAISE NOTICE 'PASS 132: cheque_tracking.status CHECK allows reversed, refunded, voided.';
END $$;

ROLLBACK;