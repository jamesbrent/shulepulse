-- ════════════════════════════════════════════════════════════════════════
-- 049_ASSET_AP_TIMELINE
-- Extends the asset timeline with the integrated AP lifecycle event types so
-- the Asset History shows the full chain:
--   Acquired → Invoice Created/Linked → Invoice Approved → Payment Made → GL
-- Requires migrations 037 and 048 (asset_events) to have run first.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE asset_events DROP CONSTRAINT IF EXISTS asset_events_event_type_check;
ALTER TABLE asset_events ADD CONSTRAINT asset_events_event_type_check CHECK (event_type IN
  ('acquired', 'assigned', 'transferred', 'maintained', 'depreciated',
   'disposed', 'status_changed', 'document_added', 'updated', 'depreciation_run',
   'invoice', 'payment', 'invoice_approved', 'invoice_posted', 'payment_made', 'gl_posted'));
