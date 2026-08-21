-- Migration 070: Sync superadmin with system
-- 1. Update superadmin role
-- 2. Fix get_my_school_id() to return NULL for superadmin
-- 3. Add superadmin bypass to ALL school-scoped RLS policies

-- 1. Update superadmin role
UPDATE profiles SET role = 'superadmin', roles = ARRAY['superadmin'] WHERE email = 'admin@shulepulse.com';

-- 2. Fix get_my_school_id() - return NULL for superadmin
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' THEN NULL
    ELSE (SELECT school_id FROM profiles WHERE id = auth.uid())
  END
$$;

-- 3. Helper function to patch policies
CREATE OR REPLACE FUNCTION _patch_rls_add_superadmin(
  p_table text, p_policy text, p_cmd text, p_using text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_policy, p_table);
  EXECUTE format('CREATE POLICY %I ON %I FOR %s USING (%s)',
    p_policy, p_table, p_cmd, p_using);
END;
$$;
-- 4. Patch core tables
SELECT _patch_rls_add_superadmin('promotion_history', 'promotion_history_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('transfer_history', 'transfer_history_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('student_documents', 'student_documents_school_isolation', 'ALL',
  '(student_id IN (SELECT id FROM students WHERE school_id = get_my_school_id())) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('fee_structure_items', 'fee_structure_items_school_isolation', 'ALL',
  '(fee_structure_id IN (SELECT id FROM fee_structures WHERE school_id = get_my_school_id())) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('grade_levels', 'grade_levels_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('discipline_records', 'discipline_records_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- Timetable
SELECT _patch_rls_add_superadmin('class_subject_requirements', 'csr_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('teacher_subject_assignments', 'tsa_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('timetable_slots', 'tt_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- Exams
SELECT _patch_rls_add_superadmin('exam_uploads', 'exam_uploads_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- Grades
SELECT _patch_rls_add_superadmin('grades', 'grades_staff_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''teacher'', ''hod'', ''class_teacher'', ''admin'', ''deputy_administrator'', ''bursar'', ''registrar'', ''superadmin'')))');

-- Messages
SELECT _patch_rls_add_superadmin('parent_messages', 'parent_messages_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('class_comments', 'class_comments_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- CBC
SELECT _patch_rls_add_superadmin('cbc_assessments', 'cbc_assessments_staff_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''teacher'', ''hod'', ''class_teacher'', ''admin'', ''deputy_administrator'', ''bursar'', ''registrar'', ''superadmin'')))');

-- Notices
SELECT _patch_rls_add_superadmin('notices', 'notices_staff_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''teacher'', ''hod'', ''class_teacher'', ''admin'', ''deputy_administrator'', ''bursar'', ''registrar'', ''reception'', ''librarian'', ''superadmin'')))');

-- Reception
SELECT _patch_rls_add_superadmin('visitors', 'visitors_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('appointments', 'appointments_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('prospective_students', 'prospective_students_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('front_office_requests', 'front_office_requests_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('school_events', 'school_events_school_isolation', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- Staff
SELECT _patch_rls_add_superadmin('non_teaching_staff', 'Staff see own school non_teaching_staff', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('departments', 'departments_same_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
-- Library
SELECT _patch_rls_add_superadmin('library_categories', 'library_categories_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_shelves', 'library_shelves_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_books', 'library_books_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_members', 'library_members_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_rules', 'library_rules_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_loans', 'library_loans_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_reservations', 'library_reservations_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_settings', 'library_settings_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_book_copies', 'library_book_copies_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');
SELECT _patch_rls_add_superadmin('library_fines', 'library_fines_school', 'ALL',
  '(school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')');

-- Accounting (036)
SELECT _patch_rls_add_superadmin('chart_of_accounts', 'coa_finance_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))');
SELECT _patch_rls_add_superadmin('chart_of_accounts', 'coa_staff_select', 'SELECT',
  '((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))');
SELECT _patch_rls_add_superadmin('journal_entries', 'je_finance_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))');
SELECT _patch_rls_add_superadmin('journal_entries', 'je_staff_select', 'SELECT',
  '((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))');
SELECT _patch_rls_add_superadmin('journal_entry_lines', 'jel_finance_all', 'ALL',
  '((get_my_role() = ''superadmin'') OR ((SELECT school_id FROM journal_entries WHERE id = journal_entry_id) = get_my_school_id()))');
SELECT _patch_rls_add_superadmin('journal_entry_lines', 'jel_staff_select', 'SELECT',
  '((get_my_role() = ''superadmin'') OR ((SELECT school_id FROM journal_entries WHERE id = journal_entry_id) = get_my_school_id()))');
SELECT _patch_rls_add_superadmin('fiscal_periods', 'fp_finance_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))');
SELECT _patch_rls_add_superadmin('fiscal_periods', 'fp_staff_select', 'SELECT',
  '((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))');

-- Payroll account mapping (040)
SELECT _patch_rls_add_superadmin('payroll_account_mapping', 'pam_finance_all', 'ALL',
  '(((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))');
SELECT _patch_rls_add_superadmin('payroll_account_mapping', 'pam_staff_select', 'SELECT',
  '((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))');
-- Dynamic-loop finance tables (037, 039, 043, 045, 050, 051)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['asset_categories','suppliers','fixed_assets','asset_events','asset_custody_history','asset_location_history','asset_maintenance','asset_depreciation_runs','asset_depreciation_lines','asset_documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_statutory_config','payroll_employees','payroll_employee_items','payroll_periods','payroll_runs','payroll_lines','payroll_payment_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ap_suppliers','ap_invoices','ap_invoice_lines','ap_tax_config','ap_payments','ap_payment_allocations','finance_attachments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tax_rules','asset_tax_schedules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['expenses','expense_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cash_transfers','bank_reconciliations','bank_reconciliation_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS fin_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY fin_all_%s ON %I FOR ALL USING (((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin'')) AND (role IN (''admin'', ''bursar'', ''deputy_administrator'', ''superadmin'')))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY staff_select_%s ON %I FOR SELECT USING ((school_id = get_my_school_id()) OR (get_my_role() = ''superadmin''))', t, t);
  END LOOP;
END $$;

-- Cleanup helper
DROP FUNCTION IF EXISTS _patch_rls_add_superadmin(text, text, text, text);
