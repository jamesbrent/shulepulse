-- ════════════════════════════════════════════════════════════════════════
-- 043_ACCOUNTS_PAYABLE
-- Non-payroll payables: what the school owes suppliers, contractors, service
-- providers, landlords, utilities, government agencies and other payees.
-- Completely separate from Payroll.
--
--   • ap_suppliers            — payee/supplier master
--   • ap_invoices             — supplier bills (draft → submitted → reviewed
--                                → approved → posted → partially_paid → paid)
--   • ap_invoice_lines        — line items (qty × unit price − discount)
--   • ap_tax_config           — effective-date VAT / default GL accounts
--   • ap_payments             — invoice & direct payments with approval chain
--   • ap_payment_allocations  — how each payment clears specific invoices
--   • finance_attachments     — supporting documents on any entity
--
-- GL integration: everything posts through the EXISTING engine
-- (journal_entries / journal_entry_lines, source = 'ap').
--   Invoice:  Dr Expense/Asset  |  Dr VAT Input      |  Cr Accounts Payable
--   Payment:  Dr Accounts Payable (or expense)       |  Cr Bank/Cash/M-Pesa
--
-- Accounts used come from the school's chart (via ap_tax_config defaults) —
-- nothing is hard-coded. Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. VAT Input account (asset) backfilled into every school's chart.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO chart_of_accounts (school_id, code, name, type, category, description)
SELECT s.id, '2145', 'VAT Input (Receivable)', 'asset', 'Tax', 'Input VAT recoverable on purchases'
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.school_id = s.id AND c.code = '2145'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. AP / tax configuration (effective-date based, approved-rate workflow
--    mirroring payroll's payroll_statutory_config).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_tax_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  item            TEXT NOT NULL CHECK (item IN ('vat_rate', 'ap_defaults')),
  value           JSONB NOT NULL,
  effective_from  DATE NOT NULL DEFAULT '2026-01-01',
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  submitted_by    UUID REFERENCES profiles(id),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apc_school ON ap_tax_config(school_id);

INSERT INTO ap_tax_config (school_id, item, value, effective_from, notes)
SELECT s.id, d.item, d.value, d.effective_from, d.notes
FROM schools s
CROSS JOIN (VALUES
  ('vat_rate', '{"rate":16}'::jsonb, '2026-01-01'::date, 'Value Added Tax on purchases (VAT Act 2013 as amended)'),
  ('ap_defaults',
    '{"ap_account":"2010","vat_input_account":"2145","bank_account":"1020","mobile_account":"1030","cash_account":"1010"}'::jsonb,
    '2026-01-01'::date, 'Default GL accounts used when posting AP invoices & payments')
) d(item, value, effective_from, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM ap_tax_config p
  WHERE p.school_id = s.id AND p.item = d.item AND p.effective_from = d.effective_from
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Suppliers / payees
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  supplier_no      TEXT NOT NULL,                       -- e.g. SUP-0001
  name             TEXT NOT NULL,
  supplier_type    TEXT NOT NULL DEFAULT 'supplier' CHECK (supplier_type IN
    ('supplier', 'contractor', 'service_provider', 'landlord', 'utilities', 'government', 'other')),
  contact_person   TEXT,
  phone            TEXT,
  email            TEXT,
  kra_pin          TEXT,
  bank_name        TEXT,
  bank_account     TEXT,
  bank_branch      TEXT,
  mpesa_number     TEXT,
  address          TEXT,
  payment_terms    TEXT,                                -- e.g. "Net 30"
  notes            TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, supplier_no)
);

CREATE INDEX IF NOT EXISTS idx_aps_school ON ap_suppliers(school_id);
CREATE INDEX IF NOT EXISTS idx_aps_active ON ap_suppliers(school_id, active);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Supplier invoices / bills
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES ap_suppliers(id) ON DELETE RESTRICT,
  invoice_no        TEXT NOT NULL,                      -- e.g. INV-0001
  supplier_ref      TEXT,                               -- the supplier's own invoice number
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  description       TEXT,
  department        TEXT,
  cost_centre       TEXT,
  tax_treatment     TEXT NOT NULL DEFAULT 'exclusive' CHECK (tax_treatment IN ('none', 'exclusive', 'inclusive')),
  vat_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'submitted', 'reviewed', 'approved', 'posted', 'partially_paid', 'paid', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id),
  submitted_by      UUID REFERENCES profiles(id),
  submitted_at      TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES profiles(id),
  reviewed_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  posted_by         UUID REFERENCES profiles(id),
  posted_at         TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_api_school  ON ap_invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_api_supplier ON ap_invoices(school_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_api_status  ON ap_invoices(school_id, status);
CREATE INDEX IF NOT EXISTS idx_api_due     ON ap_invoices(due_date);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Invoice line items (expense/asset account chosen from the chart)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_invoice_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id     UUID NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  quantity       NUMERIC(15,2) NOT NULL DEFAULT 1,
  unit_price     NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  account_id     UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  department     TEXT,
  cost_centre    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apil_invoice ON ap_invoice_lines(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Payments — invoice payments AND direct "other payments"
--    (utilities, government fees, licences, subscriptions, emergency).
--    Status: draft → submitted → reviewed → approved → processing →
--            paid → posted. Approval is admin-gated (never self-approve).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payment_no        TEXT NOT NULL,                      -- e.g. PYMT-0001
  payment_type      TEXT NOT NULL DEFAULT 'invoice' CHECK (payment_type IN ('invoice', 'direct')),
  supplier_id       UUID REFERENCES ap_suppliers(id) ON DELETE SET NULL,
  payee_name        TEXT,                               -- direct payments without a supplier
  payee_type        TEXT,
  amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    TEXT NOT NULL DEFAULT 'bank' CHECK (payment_method IN ('bank', 'mobile', 'cash', 'cheque')),
  payment_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  expense_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,  -- direct payments
  reference_no      TEXT,
  description       TEXT,
  department        TEXT,
  cost_centre       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'submitted', 'reviewed', 'approved', 'processing', 'paid', 'posted', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id),
  submitted_by      UUID REFERENCES profiles(id),
  submitted_at      TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES profiles(id),
  reviewed_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  processed_by      UUID REFERENCES profiles(id),
  processed_at      TIMESTAMPTZ,
  paid_by           UUID REFERENCES profiles(id),
  paid_at           TIMESTAMPTZ,
  posted_by         UUID REFERENCES profiles(id),
  posted_at         TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, payment_no)
);

CREATE INDEX IF NOT EXISTS idx_app_school   ON ap_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_app_supplier ON ap_payments(school_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_app_status   ON ap_payments(school_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Payment allocations → invoices (drives partial payments + outstanding)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_payment_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payment_id  UUID NOT NULL REFERENCES ap_payments(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_apa_payment  ON ap_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_apa_invoice  ON ap_payment_allocations(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Supporting documents (attachments on any AP entity)
--    Files live in the finance-attachments storage bucket; this table keeps
--    the metadata + entity link.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('supplier', 'invoice', 'payment', 'voucher')),
  entity_id     UUID NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT,
  file_size     BIGINT DEFAULT 0,
  storage_path  TEXT NOT NULL,
  uploaded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fa_school ON finance_attachments(school_id);
CREATE INDEX IF NOT EXISTS idx_fa_entity ON finance_attachments(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Storage bucket for attachments (public so vouchers/statements can link)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-attachments', 'finance-attachments', true, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fa_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "fa_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "fa_storage_delete" ON storage.objects;
CREATE POLICY "fa_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'finance-attachments'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'));
CREATE POLICY "fa_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'finance-attachments');
CREATE POLICY "fa_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'finance-attachments'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 10. RLS — finance roles manage, all staff read (same pattern as accounting)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ap_suppliers','ap_invoices','ap_invoice_lines','ap_tax_config',
    'ap_payments','ap_payment_allocations','finance_attachments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
