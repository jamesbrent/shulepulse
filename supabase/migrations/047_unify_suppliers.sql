-- ════════════════════════════════════════════════════════════════════════
-- 047_UNIFY_SUPPLIERS
-- Make `ap_suppliers` (Accounts Payable) the SINGLE global supplier master.
-- The Fixed Assets module was reading a separate, orphaned `suppliers`
-- table that had no UI to add records, so the "Acquire Asset" → Supplier
-- dropdown was always empty even after suppliers were added in AP.
--
-- This migration:
--   1. Backfills `ap_suppliers` from the legacy `suppliers` table (by name)
--      so existing asset supplier links survive.
--   2. Remaps fixed_assets.supplier_id from legacy suppliers.id to ap_suppliers.id.
--   3. Repoints the foreign key to ap_suppliers(id).
--
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Backfill ap_suppliers from legacy suppliers (rows not already present).
--    supplier_no uses a distinct prefix (SUP-L####) to avoid colliding with
--    the normal SUP-#### numbering used by the AP module.
INSERT INTO ap_suppliers (school_id, supplier_no, name, supplier_type,
  contact_person, phone, email, address, active, created_at)
SELECT s.school_id,
       'SUP-L' || LPAD(ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.created_at)::text, 4, '0'),
       s.name, 'supplier', s.contact_person, s.phone, s.email, s.address,
       s.is_active, s.created_at
FROM suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM ap_suppliers a
  WHERE a.school_id = s.school_id AND lower(a.name) = lower(s.name)
);

-- 2. Remap existing asset supplier links (legacy suppliers.id → ap_suppliers.id).
--    Guarded so we only remap when the name maps to exactly one AP supplier.
UPDATE fixed_assets fa
SET supplier_id = a.id
FROM ap_suppliers a
JOIN suppliers s ON s.school_id = a.school_id AND lower(s.name) = lower(a.name)
WHERE fa.supplier_id = s.id
  AND NOT EXISTS (
    SELECT 1 FROM ap_suppliers a2
    WHERE a2.school_id = a.school_id AND lower(a2.name) = lower(a.name) AND a2.id <> a.id
  );

-- 3. Repoint the foreign key to the global AP supplier master.
ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_supplier_id_fkey;
ALTER TABLE fixed_assets
  ADD CONSTRAINT fixed_assets_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES ap_suppliers(id) ON DELETE SET NULL;
