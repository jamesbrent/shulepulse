-- ============================================================================
-- 124_close_cross_school_rpc_gap.sql
-- HARDENING PASS — ITEM 1: Close cross-school RPC gap.
-- ----------------------------------------------------------------------------
-- record_fee_payment / preview_fee_allocation / apply_student_credit /
-- refund_student_credit (originally migration 123) are SECURITY DEFINER and
-- never verified that auth.uid() belongs to p_school_id. Any authenticated
-- user of ANY role could post or reverse money for ANY school because the
-- functions bypass RLS. The same gap exists in
-- generate_student_admission_number / preview_student_admission_number
-- (migrations 118/121), which write admission_number_sequences for an
-- arbitrary p_school_id.
--
-- Fix (pattern per migration 108):
--   * guard_school_access(p_school_id, feature_key) is SECURITY INVOKER and
--     already exists (108:25-46). It raises 42501 unless the caller's school
--     matches p_school_id, bypassing only for superadmin / service context.
--   * Add PERFORM public.guard_school_access(p_school_id) as the FIRST
--     executable statement in all six functions.
--   * feature_key intentionally NULL: the fee/admission functions are core
--     money/registration operations that all entitled schools must keep
--     working; a feature-key entitlement check here could regress e.g. Basic
--     plan schools that record payments or auto-generate admission numbers
--     via the BEFORE INSERT trigger. School binding only (judgment call).
--
-- Migration idempotent? Safe to re-run (CREATE OR REPLACE, no data changes).
-- Grants from earlier migrations are preserved by CREATE OR REPLACE.
-- ============================================================================

-- ============================ 1. record_fee_payment ============================
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
BEGIN
  PERFORM public.guard_school_access(p_school_id);

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

-- ======================= 2. preview_fee_allocation =========================
CREATE OR REPLACE FUNCTION public.preview_fee_allocation(
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
  PERFORM public.guard_school_access(p_school_id);

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

-- ========================= 3. apply_student_credit ==========================
CREATE OR REPLACE FUNCTION public.apply_student_credit(
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
  PERFORM public.guard_school_access(p_school_id);

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

-- ========================= 4. refund_student_credit ==========================
CREATE OR REPLACE FUNCTION public.refund_student_credit(
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
  PERFORM public.guard_school_access(p_school_id);

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

-- ==================== 5. generate_student_admission_number ====================
-- Replaces migration 121 version; identical body except the school guard.
CREATE OR REPLACE FUNCTION public.generate_student_admission_number(
  p_school_id UUID,
  p_year      INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM now())::INTEGER);
  v_base BIGINT;
  v_seq  BIGINT;
BEGIN
  PERFORM public.guard_school_access(p_school_id);

  -- Serialize concurrent allocation per school inside the caller transaction.
  PERFORM pg_advisory_xact_lock(hashtext('adm:' || p_school_id::text));

  -- Starting point: continue from the sequence row if present, otherwise from
  -- the highest ADM/<year>/<seq> already stored for this school.
  SELECT COALESCE(
    (SELECT last_value FROM admission_number_sequences
     WHERE school_id = p_school_id AND year = v_year),
    COALESCE((
      SELECT MAX(seq)
      FROM (
        SELECT (substring(s.admission_number, '^ADM/[0-9]+/([0-9]+)$'))::BIGINT AS seq
        FROM students s
        WHERE s.school_id = p_school_id
          AND s.admission_number ~ ('^ADM/' || v_year || '/[0-9]+$')
      ) t
    ), 0)
  ) INTO v_base;

  -- Allocate the next number: fresh row starts at v_base + 1, existing rows
  -- keep incrementing (never reuses numbers, monotonic under the lock).
  INSERT INTO admission_number_sequences (school_id, year, last_value)
  VALUES (p_school_id, v_year, v_base + 1)
  ON CONFLICT (school_id, year)
  DO UPDATE SET last_value = admission_number_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'ADM/' || v_year || '/' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ===================== 6. preview_student_admission_number ====================
CREATE OR REPLACE FUNCTION public.preview_student_admission_number(
  p_school_id UUID,
  p_year      INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM now())::INTEGER);
  v_seq  BIGINT;
BEGIN
  PERFORM public.guard_school_access(p_school_id);

  SELECT COALESCE(
    (SELECT last_value FROM admission_number_sequences WHERE school_id = p_school_id AND year = v_year),
    COALESCE((
      SELECT MAX(seq)
      FROM (
        SELECT (substring(s.admission_number, '^ADM/[0-9]+/([0-9]+)$'))::BIGINT AS seq
        FROM students s
        WHERE s.school_id = p_school_id
          AND s.admission_number ~ ('^ADM/' || v_year || '/[0-9]+$')
      ) t
    ), 0)
  ) INTO v_seq;

  RETURN 'ADM/' || v_year || '/' || lpad((v_seq + 1)::text, 4, '0');
END;
$$;

-- ============================ 7. Audit note ============================
-- create_school_admin_user (094) was audited for the same gap: it is already
-- superadmin-only (role check at 094:20-23), so no school binding is added —
-- superadmin may intentionally provision admins for any school. NO change
-- (judgment call). generate_/preview_student_admission_number are now guarded;
-- the students BEFORE INSERT trigger (118:140, SECURITY INVOKER) calls the
-- generator under the school's own context, which passes the school binding,
-- and service-context provisioning still works via the guard bypass.