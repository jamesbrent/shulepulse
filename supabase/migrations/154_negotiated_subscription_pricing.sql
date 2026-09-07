-- Migration 154: Negotiated subscription pricing columns
-- Schools may negotiate a discounted price for a plan. The standard plan price
-- (plans.monthly_price) remains the global reference and never changes. The
-- negotiated price is per-school and nullable: NULL = use standard price.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS negotiated_monthly_price NUMERIC;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS negotiated_annual_price NUMERIC;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS negotiated_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS negotiated_by UUID REFERENCES profiles(id);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS negotiated_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_negotiated_price_check'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_negotiated_price_check
      CHECK (negotiated_monthly_price IS NULL OR negotiated_monthly_price > 0);
  END IF;
END $$;

COMMENT ON COLUMN schools.negotiated_monthly_price IS 'Per-school negotiated monthly price. NULL = use standard plan price (plans.monthly_price).';
COMMENT ON COLUMN schools.negotiated_annual_price IS 'Per-school negotiated annual price (optional).';
COMMENT ON COLUMN schools.negotiated_at IS 'When the negotiated price was set.';
COMMENT ON COLUMN schools.negotiated_by IS 'Superadmin who approved the negotiated price.';
COMMENT ON COLUMN schools.negotiated_notes IS 'Internal note explaining the negotiated deal (e.g. reason for discount).';