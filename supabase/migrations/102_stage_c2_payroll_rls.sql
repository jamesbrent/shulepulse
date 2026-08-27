-- ============================================================================
-- 102_stage_c2_payroll_rls.sql
-- Stage C2: entitlement-based RLS for the Payroll module (Enterprise).
--
-- Rule (same as C1): superadmin bypass OR (own school AND my_has_feature() AND
-- role in admin|bursar|deputy_administrator). Replaces old fin_all_* /
-- staff_select_* / *_role_restricted policies with one FOR ALL policy.
--
-- Feature-key assignment:
--   payroll_runs, payroll_lines, payroll_periods, payroll_payment_requests -> payroll.runs
--   payroll_employees, payroll_employee_items                              -> payroll.employees
--   payroll_statutory_config                                               -> payroll.statutory
--   payroll_account_mapping                                                -> payroll.gl_posting
-- (salary_grades does not exist in this schema; excluded.)
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "fin_all_payroll_runs" ON payroll_runs;
DROP POLICY IF EXISTS "payroll_runs_role_restricted" ON payroll_runs;
DROP POLICY IF EXISTS "payroll_runs_entitlement_forall" ON payroll_runs;
CREATE POLICY "payroll_runs_entitlement_forall" ON payroll_runs
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_lines" ON payroll_lines;
DROP POLICY IF EXISTS "payroll_lines_role_restricted" ON payroll_lines;
DROP POLICY IF EXISTS "payroll_lines_entitlement_forall" ON payroll_lines;
CREATE POLICY "payroll_lines_entitlement_forall" ON payroll_lines
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_periods" ON payroll_periods;
DROP POLICY IF EXISTS "staff_select_payroll_periods" ON payroll_periods;
DROP POLICY IF EXISTS "payroll_periods_entitlement_forall" ON payroll_periods;
CREATE POLICY "payroll_periods_entitlement_forall" ON payroll_periods
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_payment_requests" ON payroll_payment_requests;
DROP POLICY IF EXISTS "payroll_payment_requests_role_restricted" ON payroll_payment_requests;
DROP POLICY IF EXISTS "payroll_payment_requests_entitlement_forall" ON payroll_payment_requests;
CREATE POLICY "payroll_payment_requests_entitlement_forall" ON payroll_payment_requests
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.runs') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_employees" ON payroll_employees;
DROP POLICY IF EXISTS "staff_select_payroll_employees" ON payroll_employees;
DROP POLICY IF EXISTS "payroll_employees_entitlement_forall" ON payroll_employees;
CREATE POLICY "payroll_employees_entitlement_forall" ON payroll_employees
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.employees') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.employees') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_employee_items" ON payroll_employee_items;
DROP POLICY IF EXISTS "staff_select_payroll_employee_items" ON payroll_employee_items;
DROP POLICY IF EXISTS "payroll_employee_items_entitlement_forall" ON payroll_employee_items;
CREATE POLICY "payroll_employee_items_entitlement_forall" ON payroll_employee_items
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.employees') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.employees') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "fin_all_payroll_statutory_config" ON payroll_statutory_config;
DROP POLICY IF EXISTS "staff_select_payroll_statutory_config" ON payroll_statutory_config;
DROP POLICY IF EXISTS "payroll_statutory_config_entitlement_forall" ON payroll_statutory_config;
CREATE POLICY "payroll_statutory_config_entitlement_forall" ON payroll_statutory_config
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.statutory') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.statutory') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "pam_finance_all" ON payroll_account_mapping;
DROP POLICY IF EXISTS "pam_staff_select" ON payroll_account_mapping;
DROP POLICY IF EXISTS "payroll_account_mapping_entitlement_forall" ON payroll_account_mapping;
CREATE POLICY "payroll_account_mapping_entitlement_forall" ON payroll_account_mapping
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.gl_posting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('payroll.gl_posting') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));