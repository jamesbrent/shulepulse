-- ─────────────────────────────────────────────────────────────────────────────
-- Payment dashboard: RLS policy + RPCs for superadmin
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Superadmin can read all fee_payments
DROP POLICY IF EXISTS "fee_payments_select_superadmin" ON fee_payments;
CREATE POLICY "fee_payments_select_superadmin" ON fee_payments
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- 2. RPC: recent payments with school + student names
CREATE OR REPLACE FUNCTION get_recent_payments(limit_count integer DEFAULT 20)
RETURNS TABLE(
  id UUID,
  amount numeric,
  payment_method text,
  provider text,
  reference text,
  receipt_number text,
  transaction_date date,
  school_name text,
  student_name text,
  term text,
  year integer
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fp.id,
    fp.amount,
    fp.payment_method,
    fp.provider,
    fp.reference,
    fp.receipt_number,
    fp.transaction_date,
    s.name AS school_name,
    st.full_name AS student_name,
    fp.term,
    fp.year
  FROM fee_payments fp
  JOIN schools s ON s.id = fp.school_id
  LEFT JOIN students st ON st.id = fp.student_id
  ORDER BY fp.transaction_date DESC, fp.created_at DESC
  LIMIT limit_count;
$$;

-- 3. RPC: payment method breakdown
CREATE OR REPLACE FUNCTION get_payment_method_breakdown()
RETURNS TABLE(method text, total numeric, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(NULLIF(fp.payment_method, ''), 'other') AS method,
    COALESCE(SUM(fp.amount), 0)::numeric AS total,
    COUNT(*)::bigint AS count
  FROM fee_payments fp
  GROUP BY method
  ORDER BY total DESC;
$$;

-- 4. RPC: revenue summary stats
CREATE OR REPLACE FUNCTION get_revenue_summary()
RETURNS TABLE(
  total_revenue numeric,
  this_month numeric,
  avg_transaction numeric,
  pending_cheques numeric,
  transaction_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH stats AS (
    SELECT
      COALESCE(SUM(amount), 0)::numeric AS total_revenue,
      COUNT(*)::bigint AS transaction_count,
      COALESCE(AVG(amount), 0)::numeric AS avg_transaction
    FROM fee_payments
  ),
  this_month AS (
    SELECT COALESCE(SUM(amount), 0)::numeric AS this_month
    FROM fee_payments
    WHERE date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE)
  ),
  pending AS (
    SELECT COALESCE(SUM(amount), 0)::numeric AS pending_cheques
    FROM fee_payments
    WHERE payment_method = 'cheque' AND cheque_status = 'pending'
  )
  SELECT
    stats.total_revenue,
    this_month.this_month,
    stats.avg_transaction,
    pending.pending_cheques,
    stats.transaction_count
  FROM stats, this_month, pending;
$$;
