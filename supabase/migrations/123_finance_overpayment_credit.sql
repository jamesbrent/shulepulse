-- ════════════════════════════════════════════════════════════════════════
-- 123_FINANCE_OVERPAYMENT_CREDIT
-- Student Overpayment / Credit system.
--
-- Problem: overpayments were recorded in full against a single term, creating
-- negative term balances and clearing receivables past the amount actually
-- owed (breaking the GL).
--
-- This migration:
--   1. Adds the "Student Credit / Advance Payments" liability account (2230)
--      to every school's chart (idempotent).
--   2. Creates student_credit_transactions — an auditable ledger of credit
--      movements (credit / debit / refund) kept SEPARATE from student_ledger
--      so existing fee aggregations never misclassify credit as "paid".
--   3. Rewrites record_fee_payment to AUTO-ALLOCATE a payment: settle the
--      selected term first, then any other outstanding current-year terms
--      (Term 1 → 2 → 3), then hold the remainder as student credit.
--   4. Adds preview_fee_allocation (read-only, powers the live UI breakdown).
--   5. Adds apply_student_credit (credit → a target term's assessment).
--   6. Adds refund_student_credit (controlled, auditable refund of credit).
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. Seed the student-credit liability account for every school ----------
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO chart_of_accounts (school_id, code, name, type, category, description)
SELECT s.id, '2230', 'Student Credit / Advance Payments', 'liability', 'Deposits',
       'Unearned fees — advance payments held as student credit'
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts a
  WHERE a.school_id = s.id AND a.code = '2230'
);

-- ────────────────────────────────────────────────────────────────────────
-- 2. student_credit_transactions table -----------------------------------
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'refund')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  balance         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- running balance after this txn
  payment_id      UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  ledger_entry_id UUID REFERENCES student_ledger(id) ON DELETE SET NULL,
  term            TEXT,                                -- target term when credit applied
  year            INT,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sct_school_student ON student_credit_transactions(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_sct_payment        ON student_credit_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_sct_ledger         ON student_credit_transactions(ledger_entry_id);

ALTER TABLE student_credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_credit_select"             ON student_credit_transactions;
DROP POLICY IF EXISTS "student_credit_insert_role_gated"  ON student_credit_transactions;
DROP POLICY IF EXISTS "student_credit_update_role_gated"  ON student_credit_transactions;
DROP POLICY IF EXISTS "student_credit_delete_admin_only"  ON student_credit_transactions;

CREATE POLICY "student_credit_select"
  ON student_credit_transactions FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');

CREATE POLICY "student_credit_insert_role_gated"
  ON student_credit_transactions FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY "student_credit_update_role_gated"
  ON student_credit_transactions FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY "student_credit_delete_admin_only"
  ON student_credit_transactions FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ────────────────────────────────────────────────────────────────────────
-- 3. Helpers --------------------------------------------------------------
-- ────────────────────────────────────────────────────────────────────────

-- Ledger-derived outstanding for one student/term/year. Matches the app rule:
-- charges + penalties increase; every other entry type (payment, waiver,
-- scholarship, discount, …) reduces.
CREATE OR REPLACE FUNCTION student_term_outstanding(p_school_id UUID, p_student_id UUID, p_term TEXT, p_year INT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT SUM(CASE WHEN entry_type IN ('charge', 'penalty') THEN amount ELSE -amount END)
    FROM student_ledger
    WHERE school_id = p_school_id
      AND student_id = p_student_id
      AND term      = p_term
      AND year      = p_year
  ), 0)
$$;

-- Current student credit balance (credits minus debits and refunds).
CREATE OR REPLACE FUNCTION student_credit_balance(p_school_id UUID, p_student_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0)
  FROM student_credit_transactions
  WHERE school_id = p_school_id AND student_id = p_student_id
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 4. record_fee_payment — auto-allocating version ------------------------
--    fee_payments keeps the FULL amount received. student_ledger receives
--    only what was applied per term. Excess → student credit.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_fee_payment(
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than 0.');
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

-- ────────────────────────────────────────────────────────────────────────
-- 5. preview_fee_allocation — read-only preview powering the UI breakdown
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION preview_fee_allocation(
  p_school_id UUID,
  p_student_id UUID,
  p_amount NUMERIC,
  p_term TEXT,
  p_year INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining  NUMERIC;
  v_out        NUMERIC;
  v_applied    NUMERIC;
  v_alloc      JSONB := '[]'::jsonb;
  v_term       TEXT;
BEGIN
  v_remaining := GREATEST(COALESCE(p_amount, 0), 0);

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
    v_applied := LEAST(v_remaining, GREATEST(v_out, 0));

    v_alloc := v_alloc || jsonb_build_array(
      jsonb_build_object(
        'term', v_term, 'year', p_year,
        'outstanding', GREATEST(v_out, 0),
        'applied', v_applied,
        'is_selected', (v_term = p_term)
      )
    );
    v_remaining := v_remaining - v_applied;
  END LOOP;

  RETURN jsonb_build_object(
    'allocations', v_alloc,
    'credit', v_remaining
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 6. apply_student_credit — consume credit against a term's assessment ---
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_student_credit(
  p_school_id UUID,
  p_student_id UUID,
  p_term TEXT,
  p_year INT,
  p_amount NUMERIC,
  p_user_id UUID,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  NUMERIC;
  v_out      NUMERIC;
  v_apply    NUMERIC;
  v_ledger_id UUID;
  v_new_bal  NUMERIC;
BEGIN
  v_balance := GREATEST(student_credit_balance(p_school_id, p_student_id), 0);
  v_out     := GREATEST(student_term_outstanding(p_school_id, p_student_id, p_term, p_year), 0);

  v_apply := LEAST(COALESCE(p_amount, 0), v_balance, v_out);
  IF v_apply <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available credit or no outstanding balance for this term.');
  END IF;

  INSERT INTO student_ledger (
    school_id, student_id, entry_type, amount, term, year, description
  ) VALUES (
    p_school_id, p_student_id, 'payment', v_apply, p_term, p_year,
    COALESCE(NULLIF(p_description, ''), 'Student credit applied to ' || p_term)
  )
  RETURNING id INTO v_ledger_id;

  v_new_bal := v_balance - v_apply;

  INSERT INTO student_credit_transactions (
    school_id, student_id, type, amount, balance, ledger_entry_id,
    term, year, description, created_by
  ) VALUES (
    p_school_id, p_student_id, 'debit', v_apply, v_new_bal,
    v_ledger_id, p_term, p_year,
    'Student credit applied to ' || p_term || ' — ' || p_year,
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'applied', v_apply,
    'new_balance', v_new_bal,
    'outstanding', GREATEST(v_out - v_apply, 0),
    'ledger_entry_id', v_ledger_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 7. refund_student_credit — controlled, auditable credit refund ---------
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refund_student_credit(
  p_school_id UUID,
  p_student_id UUID,
  p_amount NUMERIC,
  p_payment_id UUID,
  p_refund_date DATE,
  p_description TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  NUMERIC;
  v_refund   NUMERIC;
  v_new_bal  NUMERIC;
  v_txn_id   UUID;
BEGIN
  v_balance := GREATEST(student_credit_balance(p_school_id, p_student_id), 0);
  v_refund  := LEAST(COALESCE(p_amount, 0), v_balance);

  IF v_refund <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available student credit to refund.');
  END IF;

  v_new_bal := v_balance - v_refund;

  INSERT INTO student_credit_transactions (
    school_id, student_id, type, amount, balance, payment_id,
    entry_date, description, created_by
  ) VALUES (
    p_school_id, p_student_id, 'refund', v_refund, v_new_bal,
    p_payment_id, COALESCE(p_refund_date, CURRENT_DATE),
    COALESCE(p_description, 'Refund of student credit'),
    p_user_id
  )
  RETURNING id INTO v_txn_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_id', v_txn_id,
    'amount', v_refund,
    'new_balance', v_new_bal
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 8. Grants --------------------------------------------------------------
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION preview_fee_allocation FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_student_credit     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refund_student_credit    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_fee_allocation TO authenticated;
GRANT EXECUTE ON FUNCTION apply_student_credit     TO authenticated;
GRANT EXECUTE ON FUNCTION refund_student_credit    TO authenticated;