-- ════════════════════════════════════════════════════════════════════════
-- 044_AP_REJECTION
-- Adds a formal REJECTED status to Accounts Payable invoices & payments so
-- the admin / principal can reject an item with a recorded reason (pending
-- approvals workflow). Safe to re-run.
--
--   • ap_invoices.status  gains 'rejected'  (+ rejection_reason, rejected_by, rejected_at)
--   • ap_payments.status  gains 'rejected'  (+ rejection_reason, rejected_by, rejected_at)
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ap_invoices
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ap_invoices
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ;

ALTER TABLE ap_invoices DROP CONSTRAINT IF EXISTS ap_invoices_status_check;
ALTER TABLE ap_invoices ADD CONSTRAINT ap_invoices_status_check CHECK (status IN
  ('draft', 'submitted', 'reviewed', 'approved', 'posted', 'partially_paid', 'paid', 'rejected', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ap_payments
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ap_payments
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ;

ALTER TABLE ap_payments DROP CONSTRAINT IF EXISTS ap_payments_status_check;
ALTER TABLE ap_payments ADD CONSTRAINT ap_payments_status_check CHECK (status IN
  ('draft', 'submitted', 'reviewed', 'approved', 'processing', 'paid', 'posted', 'rejected', 'cancelled'));
