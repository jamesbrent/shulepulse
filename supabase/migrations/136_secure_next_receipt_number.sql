-- ============================================================================
-- 136_secure_next_receipt_number.sql
-- SECURITY FIX (audit C3): guarantee next_receipt_number is the guarded version.
--
-- Background:
--   * 074_security_hardening.sql created next_receipt_number WITHOUT a school
--     guard (accepts an arbitrary p_school_id, SECURITY DEFINER).
--   * 108_stage_d_definer_hardening.sql re-created it WITH guard_school_access.
--   * No later migration re-defines it (128 only adds a calling trigger), so IF
--     migrations were applied in numeric order the guarded version is live.
--
--   However, this project applies SQL manually and migrations 005+ are NOT
--   recorded in the remote schema_migrations table, so the actually-live body
--   cannot be assumed. This migration is an explicit, idempotent re-create of
--   the GUARDED version so that, regardless of history/ordering, the live
--   function always verifies the caller belongs to the target school. It
--   supersedes both 074 and 108 to remove future ordering ambiguity.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'RCP';
  v_year TEXT := to_char(now(), 'YY');
  v_seq INT;
  v_receipt TEXT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.receipts');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || 'receipt' || v_year))::bit(64)::bigint);
  SELECT COALESCE(MAX( CAST(split_part(receipt_number, '-', 3) AS INT) ), 0) + 1 INTO v_seq
  FROM fee_payments WHERE school_id = p_school_id AND receipt_number LIKE v_prefix || '-' || v_year || '-%';
  v_receipt := v_prefix || '-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN v_receipt;
END;
$function$;

-- Keep grant parity with the rest of the hardened definer functions.
REVOKE ALL ON FUNCTION public.next_receipt_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_receipt_number(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.next_receipt_number(uuid) TO authenticated, service_role;
