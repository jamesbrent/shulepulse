-- ============================================================================
-- 101_stage_c1_finance_rls.sql
-- Stage C1: entitlement-based RLS for the Finance/Accounting module.
--
-- Rule (config from Stage A helper `my_has_feature`):
--   superadmin bypass OR (own school AND my_has_feature(<feature>) AND role in
--   admin|bursar|deputy_administrator)
--
-- Replaces the old permissive policies in place (DROP old names, CREATE one
-- consolidated FOR ALL policy to authenticated). Basic-plan schools keep reads
-- on core finance (finance.fees etc., NOT touched here); this module's tables
-- are gated to Enterprise account features.
--
-- Feature-key assignment:
--   chart_of_accounts, fiscal_periods, finance_attachments  -> finance.accounting
--   journal_entries, journal_entry_lines, journal_number_counters -> finance.journal
--   expenses, expense_lines                                 -> finance.expenses
--   cash_transfers, bank_reconciliations, bank_reconciliation_lines, cheque_tracking -> finance.cash_bank
--   fixed_assets + asset_*                                  -> finance.assets
--   ap_*, suppliers, tax_rules                              -> finance.ap
-- Safe to re-run (DROP IF EXISTS / CREATE with unique name).
-- ============================================================================

-- helper macro kept inline for reproducibility:
-- USING/WITH CHECK condition:
--   get_my_role() = 'superadmin'
--   OR ( <school_scope>
--        AND my_has_feature('<feature>')
--        AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator']) )

-- ------------------------------ finance.accounting ------------------------------
DROP POLICY IF EXISTS "coa_finance_all" ON chart_of_accounts;
DROP POLICY IF EXISTS "coa_staff_select" ON chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_entitlement_forall" ON chart_of_accounts;
CREATE POLICY "chart_of_accounts_entitlement_forall" ON chart_of_accounts
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fp_finance_all" ON fiscal_periods;
DROP POLICY IF EXISTS "fp_staff_select" ON fiscal_periods;
DROP POLICY IF EXISTS "fiscal_periods_entitlement_forall" ON fiscal_periods;
CREATE POLICY "fiscal_periods_entitlement_forall" ON fiscal_periods
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_finance_attachments" ON finance_attachments;
DROP POLICY IF EXISTS "staff_select_finance_attachments" ON finance_attachments;
DROP POLICY IF EXISTS "finance_attachments_entitlement_forall" ON finance_attachments;
CREATE POLICY "finance_attachments_entitlement_forall" ON finance_attachments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.accounting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- -------------------------------- finance.journal -------------------------------
DROP POLICY IF EXISTS "je_finance_all" ON journal_entries;
DROP POLICY IF EXISTS "je_staff_select" ON journal_entries;
DROP POLICY IF EXISTS "journal_entries_entitlement_forall" ON journal_entries;
CREATE POLICY "journal_entries_entitlement_forall" ON journal_entries
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.journal') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.journal') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "jel_finance_all" ON journal_entry_lines;
DROP POLICY IF EXISTS "jel_staff_select" ON journal_entry_lines;
DROP POLICY IF EXISTS "journal_entry_lines_entitlement_forall" ON journal_entry_lines;
CREATE POLICY "journal_entry_lines_entitlement_forall" ON journal_entry_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      get_my_school_id() = (SELECT je.school_id FROM journal_entries je WHERE je.id = journal_entry_lines.journal_entry_id)
      AND my_has_feature('finance.journal')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])
    ))
  WITH CHECK (get_my_role() = 'superadmin' OR (
      get_my_school_id() = (SELECT je.school_id FROM journal_entries je WHERE je.id = journal_entry_lines.journal_entry_id)
      AND my_has_feature('finance.journal')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])
    ));

DROP POLICY IF EXISTS "jnc_insert" ON journal_number_counters;
DROP POLICY IF EXISTS "jnc_select" ON journal_number_counters;
DROP POLICY IF EXISTS "jnc_update" ON journal_number_counters;
DROP POLICY IF EXISTS "journal_number_counters_entitlement_forall" ON journal_number_counters;
CREATE POLICY "journal_number_counters_entitlement_forall" ON journal_number_counters
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.journal') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.journal') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- ------------------------------- finance.expenses ------------------------------
DROP POLICY IF EXISTS "fin_all_expenses" ON expenses;
DROP POLICY IF EXISTS "staff_select_expenses" ON expenses;
DROP POLICY IF EXISTS "expenses_entitlement_forall" ON expenses;
CREATE POLICY "expenses_entitlement_forall" ON expenses
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.expenses') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.expenses') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_expense_lines" ON expense_lines;
DROP POLICY IF EXISTS "staff_select_expense_lines" ON expense_lines;
DROP POLICY IF EXISTS "expense_lines_entitlement_forall" ON expense_lines;
CREATE POLICY "expense_lines_entitlement_forall" ON expense_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.expenses') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.expenses') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- ----------------------------- finance.cash_bank -------------------------------
DROP POLICY IF EXISTS "fin_all_cash_transfers" ON cash_transfers;
DROP POLICY IF EXISTS "staff_select_cash_transfers" ON cash_transfers;
DROP POLICY IF EXISTS "cash_transfers_entitlement_forall" ON cash_transfers;
CREATE POLICY "cash_transfers_entitlement_forall" ON cash_transfers
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_bank_reconciliations" ON bank_reconciliations;
DROP POLICY IF EXISTS "staff_select_bank_reconciliations" ON bank_reconciliations;
DROP POLICY IF EXISTS "bank_reconciliations_entitlement_forall" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_entitlement_forall" ON bank_reconciliations
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_bank_reconciliation_lines" ON bank_reconciliation_lines;
DROP POLICY IF EXISTS "staff_select_bank_reconciliation_lines" ON bank_reconciliation_lines;
DROP POLICY IF EXISTS "bank_reconciliation_lines_entitlement_forall" ON bank_reconciliation_lines;
CREATE POLICY "bank_reconciliation_lines_entitlement_forall" ON bank_reconciliation_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "school_isolation" ON cheque_tracking;
DROP POLICY IF EXISTS "cheque_tracking_entitlement_forall" ON cheque_tracking;
CREATE POLICY "cheque_tracking_entitlement_forall" ON cheque_tracking
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.cash_bank') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- ------------------------------- finance.assets --------------------------------
DROP POLICY IF EXISTS "fin_all_fixed_assets" ON fixed_assets;
DROP POLICY IF EXISTS "staff_select_fixed_assets" ON fixed_assets;
DROP POLICY IF EXISTS "fixed_assets_entitlement_forall" ON fixed_assets;
CREATE POLICY "fixed_assets_entitlement_forall" ON fixed_assets
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_categories" ON asset_categories;
DROP POLICY IF EXISTS "staff_select_asset_categories" ON asset_categories;
DROP POLICY IF EXISTS "asset_categories_entitlement_forall" ON asset_categories;
CREATE POLICY "asset_categories_entitlement_forall" ON asset_categories
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_documents" ON asset_documents;
DROP POLICY IF EXISTS "staff_select_asset_documents" ON asset_documents;
DROP POLICY IF EXISTS "asset_documents_entitlement_forall" ON asset_documents;
CREATE POLICY "asset_documents_entitlement_forall" ON asset_documents
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_custody_history" ON asset_custody_history;
DROP POLICY IF EXISTS "staff_select_asset_custody_history" ON asset_custody_history;
DROP POLICY IF EXISTS "asset_custody_history_entitlement_forall" ON asset_custody_history;
CREATE POLICY "asset_custody_history_entitlement_forall" ON asset_custody_history
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_depreciation_lines" ON asset_depreciation_lines;
DROP POLICY IF EXISTS "staff_select_asset_depreciation_lines" ON asset_depreciation_lines;
DROP POLICY IF EXISTS "asset_depreciation_lines_entitlement_forall" ON asset_depreciation_lines;
CREATE POLICY "asset_depreciation_lines_entitlement_forall" ON asset_depreciation_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_depreciation_runs" ON asset_depreciation_runs;
DROP POLICY IF EXISTS "staff_select_asset_depreciation_runs" ON asset_depreciation_runs;
DROP POLICY IF EXISTS "asset_depreciation_runs_entitlement_forall" ON asset_depreciation_runs;
CREATE POLICY "asset_depreciation_runs_entitlement_forall" ON asset_depreciation_runs
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_events" ON asset_events;
DROP POLICY IF EXISTS "staff_select_asset_events" ON asset_events;
DROP POLICY IF EXISTS "asset_events_entitlement_forall" ON asset_events;
CREATE POLICY "asset_events_entitlement_forall" ON asset_events
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_location_history" ON asset_location_history;
DROP POLICY IF EXISTS "staff_select_asset_location_history" ON asset_location_history;
DROP POLICY IF EXISTS "asset_location_history_entitlement_forall" ON asset_location_history;
CREATE POLICY "asset_location_history_entitlement_forall" ON asset_location_history
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_maintenance" ON asset_maintenance;
DROP POLICY IF EXISTS "staff_select_asset_maintenance" ON asset_maintenance;
DROP POLICY IF EXISTS "asset_maintenance_entitlement_forall" ON asset_maintenance;
CREATE POLICY "asset_maintenance_entitlement_forall" ON asset_maintenance
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_asset_tax_schedules" ON asset_tax_schedules;
DROP POLICY IF EXISTS "staff_select_asset_tax_schedules" ON asset_tax_schedules;
DROP POLICY IF EXISTS "asset_tax_schedules_entitlement_forall" ON asset_tax_schedules;
CREATE POLICY "asset_tax_schedules_entitlement_forall" ON asset_tax_schedules
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.assets') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- --------------------------------- finance.ap ------------------------------
DROP POLICY IF EXISTS "ap_invoices_role_restricted" ON ap_invoices;
DROP POLICY IF EXISTS "fin_all_ap_invoices" ON ap_invoices;
DROP POLICY IF EXISTS "ap_invoices_entitlement_forall" ON ap_invoices;
CREATE POLICY "ap_invoices_entitlement_forall" ON ap_invoices
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_ap_invoice_lines" ON ap_invoice_lines;
DROP POLICY IF EXISTS "staff_select_ap_invoice_lines" ON ap_invoice_lines;
DROP POLICY IF EXISTS "ap_invoice_lines_entitlement_forall" ON ap_invoice_lines;
CREATE POLICY "ap_invoice_lines_entitlement_forall" ON ap_invoice_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "ap_payments_role_restricted" ON ap_payments;
DROP POLICY IF EXISTS "fin_all_ap_payments" ON ap_payments;
DROP POLICY IF EXISTS "ap_payments_entitlement_forall" ON ap_payments;
CREATE POLICY "ap_payments_entitlement_forall" ON ap_payments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_ap_payment_allocations" ON ap_payment_allocations;
DROP POLICY IF EXISTS "staff_select_ap_payment_allocations" ON ap_payment_allocations;
DROP POLICY IF EXISTS "ap_payment_allocations_entitlement_forall" ON ap_payment_allocations;
CREATE POLICY "ap_payment_allocations_entitlement_forall" ON ap_payment_allocations
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_ap_suppliers" ON ap_suppliers;
DROP POLICY IF EXISTS "staff_select_ap_suppliers" ON ap_suppliers;
DROP POLICY IF EXISTS "ap_suppliers_entitlement_forall" ON ap_suppliers;
CREATE POLICY "ap_suppliers_entitlement_forall" ON ap_suppliers
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_ap_tax_config" ON ap_tax_config;
DROP POLICY IF EXISTS "staff_select_ap_tax_config" ON ap_tax_config;
DROP POLICY IF EXISTS "ap_tax_config_entitlement_forall" ON ap_tax_config;
CREATE POLICY "ap_tax_config_entitlement_forall" ON ap_tax_config
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_suppliers" ON suppliers;
DROP POLICY IF EXISTS "staff_select_suppliers" ON suppliers;
DROP POLICY IF EXISTS "suppliers_entitlement_forall" ON suppliers;
CREATE POLICY "suppliers_entitlement_forall" ON suppliers
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_tax_rules" ON tax_rules;
DROP POLICY IF EXISTS "staff_select_tax_rules" ON tax_rules;
DROP POLICY IF EXISTS "tax_rules_entitlement_forall" ON tax_rules;
CREATE POLICY "tax_rules_entitlement_forall" ON tax_rules
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('finance.ap') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));