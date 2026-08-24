-- ============================================================
-- 077_remaining_security_fixes.sql
-- VULN-04, VULN-09, VULN-12, VULN-21, VULN-22
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- VULN-04: Revoke direct auth.users access from authenticated
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  REVOKE SELECT ON auth.users FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'REVOKE auth.users skipped: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-09: Server-side school switching RPC
-- Prevents direct profiles.school_id UPDATE from client
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION switch_school(
  p_user_id UUID,
  p_school_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_user_id AND get_my_role() != 'superadmin' THEN
    RAISE EXCEPTION 'Cannot switch school for another user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND (
      school_id = p_school_id
      OR id = auth.uid()
      OR get_my_role() = 'superadmin'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid school selection';
  END IF;

  UPDATE profiles SET school_id = p_school_id WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION switch_school FROM PUBLIC;
GRANT EXECUTE ON FUNCTION switch_school TO authenticated;

-- ──────────────────────────────────────────────────────────
-- VULN-12: Add SET search_path to SECURITY DEFINER functions
-- that are missing it
-- ──────────────────────────────────────────────────────────

-- 004: promote_students function
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'promote_students') THEN
    ALTER FUNCTION promote_students(p_class_id UUID, p_academic_year INT, p_school_id UUID)
      SET search_path = public;
  END IF;
END $$;

-- 031: generate_book_copy_code
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_book_copy_code') THEN
    ALTER FUNCTION generate_book_copy_code(p_book_id UUID)
      SET search_path = public;
  END IF;
END $$;

-- 032: generate_random_copy_code
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_random_copy_code') THEN
    ALTER FUNCTION generate_random_copy_code()
      SET search_path = public;
  END IF;
END $$;

-- 055: next_journal_entry_number
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'next_journal_entry_number') THEN
    ALTER FUNCTION next_journal_entry_number(p_school_id UUID)
      SET search_path = public;
  END IF;
END $$;

-- 068: get_my_school_id and get_my_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_school_id') THEN
    ALTER FUNCTION get_my_school_id()
      SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_role') THEN
    ALTER FUNCTION get_my_role()
      SET search_path = public;
  END IF;
END $$;

-- 070: sync_superadmin_school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_superadmin_school') THEN
    ALTER FUNCTION sync_superadmin_school()
      SET search_path = public;
  END IF;
END $$;

-- 074: next_receipt_number and audit_log_trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'next_receipt_number') THEN
    ALTER FUNCTION next_receipt_number(p_school_id UUID)
      SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_trigger') THEN
    ALTER FUNCTION audit_log_trigger()
      SET search_path = public;
  END IF;
END $$;

-- 075: record_fee_payment
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_fee_payment') THEN
    ALTER FUNCTION record_fee_payment(
      p_school_id UUID, p_student_id UUID, p_amount NUMERIC,
      p_payment_type TEXT, p_payment_method TEXT, p_provider TEXT,
      p_reference TEXT, p_receipt_number TEXT, p_received_by UUID,
      p_transaction_date DATE, p_term TEXT, p_year INT, p_description TEXT
    ) SET search_path = public;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-21: Verify RLS policies don't use auth.jwt()->>'role'
-- All policies should use get_my_role() (SECURITY DEFINER)
-- This is a safety net — any policy using auth.jwt()->>'role' is flagged
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual::text AS using_expr
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual::text LIKE '%auth.jwt%' OR with_check::text LIKE '%auth.jwt%')
  LOOP
    RAISE WARNING 'VULN-21: Policy %.%.% still uses auth.jwt()', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-22: CHECK constraints on journal_entry_lines
-- Ensure debit/credit are non-negative
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'journal_entry_lines') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'jel_non_negative_debit'
      AND conrelid = 'journal_entry_lines'::regclass
    ) THEN
      ALTER TABLE journal_entry_lines
        ADD CONSTRAINT jel_non_negative_debit CHECK (debit >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'jel_non_negative_credit'
      AND conrelid = 'journal_entry_lines'::regclass
    ) THEN
      ALTER TABLE journal_entry_lines
        ADD CONSTRAINT jel_non_negative_credit CHECK (credit >= 0);
    END IF;
  END IF;
END $$;
