-- ════════════════════════════════════════════════════════════════════════
-- 048_FIXED_ASSETS_AP_LINK
-- Integrated Asset ↔ Accounts Payable workflow.
--   • fixed_assets.purchase_invoice_id  → FK to ap_invoices (the real link)
--   • fixed_assets.acquisition_source   → supplier/cash/bank/donation/transfer/other
--   • fixed_assets.payment_status       → unpaid/partially_paid/fully_paid
-- Requires migration 043 (ap_invoices) and 047 (supplier unification) to
-- have run first. Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID REFERENCES ap_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS payment_status TEXT CHECK (payment_status IN ('unpaid', 'partially_paid', 'fully_paid'));

CREATE INDEX IF NOT EXISTS idx_fa_purchase_invoice ON fixed_assets(purchase_invoice_id);

-- Asset timeline gains the invoice / payment event types used by the integrated
-- AP workflow (migration 037 limited the list to the original lifecycle events).
ALTER TABLE asset_events DROP CONSTRAINT IF EXISTS asset_events_event_type_check;
ALTER TABLE asset_events ADD CONSTRAINT asset_events_event_type_check CHECK (event_type IN
  ('acquired', 'assigned', 'transferred', 'maintained', 'depreciated',
   'disposed', 'status_changed', 'document_added', 'updated', 'depreciation_run',
   'invoice', 'payment'));
