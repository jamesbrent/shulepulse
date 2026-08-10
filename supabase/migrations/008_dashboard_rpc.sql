-- ─────────────────────────────────────────────────────────────────────────────
-- RPC function: get_monthly_revenue
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_monthly_revenue()
RETURNS TABLE(month text, amount numeric)
LANGUAGE sql
AS $$
  SELECT
    to_char(transaction_date, 'Mon') || ' ' || to_char(transaction_date, 'YY') AS month,
    COALESCE(SUM(amount), 0)::numeric AS amount
  FROM fee_payments
  WHERE transaction_date IS NOT NULL
  GROUP BY to_char(transaction_date, 'Mon YY'), date_trunc('month', transaction_date)
  ORDER BY date_trunc('month', transaction_date) ASC;
$$;
