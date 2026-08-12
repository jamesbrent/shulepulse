-- ════════════════════════════════════════════════════════════════════════
-- 037_FIXED_ASSETS
-- Fixed Assets + Depreciation for the Finance & Accounting module.
--   • asset_categories        — per-category depreciation policy
--   • suppliers               — vendor records (shared with AP in phase 4)
--   • fixed_assets            — asset register (owner = school, custodian = staff)
--   • asset_events            — audit timeline per asset (every action logged)
--   • asset_custody_history   — who held the asset, and when
--   • asset_location_history  — where the asset was, and when
--   • asset_maintenance       — service records
--   • asset_depreciation_runs — grouped depreciation postings (→ GL)
--   • asset_depreciation_lines— per-asset depreciation detail
--   • asset_documents         — invoices, warranty, allocation forms…
-- Depreciation posts to the General Ledger via postToJournal():
--   Debit  Depreciation Expense  → Credit  Accumulated Depreciation
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Asset Categories (depreciation policy)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  depreciation_method   TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'reducing_balance')),
  useful_life_months    INTEGER NOT NULL DEFAULT 60,
  depreciation_rate     NUMERIC(6,2) DEFAULT 0,   -- annual % (reducing balance)
  residual_value        NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_cat_school ON asset_categories(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Suppliers / Vendors (lightweight — full module ships in phase 4)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  tin_number      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_school ON suppliers(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Fixed Assets Register
--    Owner is always the school; custodian is the staff member responsible.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id                TEXT NOT NULL,                -- e.g. AST-2026-0001
  name                    TEXT NOT NULL,
  category_id             UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  asset_type              TEXT DEFAULT 'equipment',
  serial_number           TEXT,
  model                   TEXT,
  manufacturer            TEXT,
  description             TEXT,
  photo_path              TEXT,                          -- documents bucket path
  purchase_date           DATE,
  supplier_id             UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_invoice_ref    TEXT,
  purchase_cost           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  residual_value          NUMERIC(15,2) NOT NULL DEFAULT 0,
  useful_life_months      INTEGER NOT NULL DEFAULT 60,
  depreciation_method     TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'reducing_balance')),
  depreciation_rate       NUMERIC(6,2) DEFAULT 0,
  accumulated_depreciation NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (accumulated_depreciation >= 0),
  nbv                     NUMERIC(15,2) NOT NULL DEFAULT 0,
  warranty_until          DATE,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active', 'in_storage', 'under_maintenance', 'lost', 'damaged', 'disposed', 'transferred')),
  -- location
  campus                  TEXT,
  building                TEXT,
  department              TEXT,
  room                    TEXT,
  specific_location       TEXT,
  -- custody
  custodian_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_date           DATE,
  -- disposal
  disposal_date           DATE,
  disposal_reason         TEXT,
  disposal_amount         NUMERIC(15,2) DEFAULT 0,
  created_by              UUID REFERENCES profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_fa_school    ON fixed_assets(school_id);
CREATE INDEX IF NOT EXISTS idx_fa_status    ON fixed_assets(school_id, status);
CREATE INDEX IF NOT EXISTS idx_fa_category  ON fixed_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fa_custodian ON fixed_assets(custodian_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Asset Event Timeline (purchased, assigned, transferred, maintained,
--    depreciated, disposed — the auditor's view of the asset's life)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id      UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
    ('acquired', 'assigned', 'transferred', 'maintained', 'depreciated',
     'disposed', 'status_changed', 'document_added', 'updated', 'depreciation_run')),
  description   TEXT,
  performed_by  UUID REFERENCES profiles(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_asset ON asset_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_ae_school ON asset_events(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Custody History
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_custody_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id      UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  custodian_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  from_date     DATE,
  to_date       DATE,
  notes         TEXT,
  recorded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ach_asset ON asset_custody_history(asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Location History
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_location_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id          UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  campus            TEXT,
  building          TEXT,
  department        TEXT,
  room              TEXT,
  specific_location TEXT,
  from_date         DATE,
  to_date           DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alh_asset ON asset_location_history(asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Maintenance Records
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id           UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  maintenance_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  maintenance_type   TEXT NOT NULL DEFAULT 'preventive'
    CHECK (maintenance_type IN ('preventive', 'corrective', 'inspection')),
  description        TEXT,
  cost               NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_provider   TEXT,
  status             TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  next_service_date  DATE,
  performed_by       UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_am_asset ON asset_maintenance(asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Depreciation Runs (grouped postings → GL)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  run_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  period_label       TEXT NOT NULL,               -- e.g. "Aug 2026"
  description        TEXT,
  total_depreciation NUMERIC(15,2) NOT NULL DEFAULT 0,
  journal_entry_id   UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adr_school ON asset_depreciation_runs(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Depreciation Lines (per asset per run)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID REFERENCES schools(id) ON DELETE CASCADE,
  run_id              UUID NOT NULL REFERENCES asset_depreciation_runs(id) ON DELETE CASCADE,
  asset_id            UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_label        TEXT,
  depreciation_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  accumulated_before  NUMERIC(15,2) NOT NULL DEFAULT 0,
  accumulated_after   NUMERIC(15,2) NOT NULL DEFAULT 0,
  nbv_before          NUMERIC(15,2) NOT NULL DEFAULT 0,
  nbv_after           NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adl_school ON asset_depreciation_lines(school_id);

-- Re-runnable fix: if asset_depreciation_lines was created by an earlier run
-- that predated the school_id column, add it and backfill from its run.
ALTER TABLE asset_depreciation_lines ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
UPDATE asset_depreciation_lines l
  SET school_id = r.school_id
  FROM asset_depreciation_runs r
  WHERE r.id = l.run_id AND l.school_id IS NULL;
ALTER TABLE asset_depreciation_lines ALTER COLUMN school_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adl_run   ON asset_depreciation_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_adl_asset ON asset_depreciation_lines(asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Asset Documents (purchase invoice, warranty, allocation form…)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id      UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'other' CHECK (document_type IN
    ('purchase_invoice', 'warranty', 'delivery_note', 'allocation_form',
     'maintenance', 'disposal', 'photo', 'other')),
  title         TEXT,
  file_name     TEXT,
  storage_path  TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adoc_asset ON asset_documents(asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 11. RLS — finance roles manage, all staff read (same pattern as accounting)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_categories','suppliers','fixed_assets','asset_events',
    'asset_custody_history','asset_location_history','asset_maintenance',
    'asset_depreciation_runs','asset_depreciation_lines','asset_documents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
