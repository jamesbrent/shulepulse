-- ─────────────────────────────────────────────────────────────────────────────
-- Fee System Redesign — Dynamic Categories + Structure Items
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enhance fee_categories with SaaS-friendly properties
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS code          TEXT;
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS is_recurring  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS is_refundable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS is_taxable    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS applies_to    TEXT    DEFAULT 'all';
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN fee_categories.applies_to  IS 'all | boarding | day | transport | or custom rule key';
COMMENT ON COLUMN fee_categories.is_recurring IS 'Auto-applied every term (true) or one-time (false)';

-- 2. Add is_active to fee_structures so existing structures can be soft-disabled
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3. New table: fee_structure_items (one header → many line items)
CREATE TABLE IF NOT EXISTS fee_structure_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id  UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  fee_category_id   UUID NOT NULL REFERENCES fee_categories(id) ON DELETE RESTRICT,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fee_structure_id, fee_category_id)
);

CREATE INDEX IF NOT EXISTS idx_fsi_structure ON fee_structure_items(fee_structure_id);
CREATE INDEX IF NOT EXISTS idx_fsi_category  ON fee_structure_items(fee_category_id);

ALTER TABLE fee_structure_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_structure_items_school_isolation" ON fee_structure_items;
CREATE POLICY "fee_structure_items_school_isolation"
  ON fee_structure_items
  USING (
    fee_structure_id IN (
      SELECT id FROM fee_structures WHERE school_id = (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- 4. Populate fee_structure_items from existing fee_structures data
--    (safe to re-run — uses ON CONFLICT DO NOTHING)
INSERT INTO fee_structure_items (fee_structure_id, fee_category_id, amount)
SELECT id, category_id, amount FROM fee_structures
ON CONFLICT (fee_structure_id, fee_category_id) DO NOTHING;

-- 5. Optional view for easy querying (combines header + item + category)
--    security_invoker ensures RLS on base tables is enforced for the caller
CREATE OR REPLACE VIEW vw_fee_structure_details WITH (security_invoker = true) AS
SELECT
  fs.id            AS structure_id,
  fs.school_id,
  fs.class,
  fs.term,
  fs.year,
  fs.is_active     AS structure_active,
  fsi.id           AS item_id,
  fsi.amount,
  fc.id            AS category_id,
  fc.name          AS category_name,
  fc.mandatory,
  fc.is_recurring,
  fc.applies_to,
  fc.display_order
FROM fee_structures fs
JOIN fee_structure_items fsi ON fsi.fee_structure_id = fs.id
JOIN fee_categories fc      ON fc.id = fsi.fee_category_id;
