-- ============================================================
-- 079_final_hardening.sql
-- M070 FOR ALL policy splits + numbering RPCs + storage fixes
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- VULN-51: Re-split M070 FOR ALL policies
-- M070 converted SELECT-only isolation policies to FOR ALL,
-- allowing any same-school user to INSERT/UPDATE/DELETE.
-- Re-split into SELECT (all staff) + role-gated writes.
-- ──────────────────────────────────────────────────────────

-- promotion_history: only admin/deputy can write
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'promotion_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS promotion_history_school_isolation ON promotion_history';
    EXECUTE 'CREATE POLICY "promotion_history_select" ON promotion_history FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "promotion_history_insert_role_gated" ON promotion_history FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "promotion_history_update_role_gated" ON promotion_history FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "promotion_history_delete_role_gated" ON promotion_history FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- transfer_history: only admin/deputy can write
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfer_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS transfer_history_school_isolation ON transfer_history';
    EXECUTE 'CREATE POLICY "transfer_history_select" ON transfer_history FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "transfer_history_insert_role_gated" ON transfer_history FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "transfer_history_update_role_gated" ON transfer_history FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "transfer_history_delete_role_gated" ON transfer_history FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- grade_levels: only admin/hod can write
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'grade_levels') THEN
    EXECUTE 'DROP POLICY IF EXISTS grade_levels_school_isolation ON grade_levels';
    EXECUTE 'CREATE POLICY "grade_levels_select" ON grade_levels FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "grade_levels_insert_role_gated" ON grade_levels FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''hod'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "grade_levels_update_role_gated" ON grade_levels FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''hod'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "grade_levels_delete_role_gated" ON grade_levels FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- student_documents: admin/deputy/teacher can write
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'student_documents') THEN
    EXECUTE 'DROP POLICY IF EXISTS student_documents_school_isolation ON student_documents';
    EXECUTE 'CREATE POLICY "student_documents_select" ON student_documents FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "student_documents_insert_role_gated" ON student_documents FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''teacher'', ''class_teacher'', ''registrar'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "student_documents_delete_role_gated" ON student_documents FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- class_subject_requirements: admin/hod can write
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'class_subject_requirements') THEN
    EXECUTE 'DROP POLICY IF EXISTS csr_school_isolation ON class_subject_requirements';
    EXECUTE 'CREATE POLICY "csr_select" ON class_subject_requirements FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "csr_insert_role_gated" ON class_subject_requirements FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''hod'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "csr_update_role_gated" ON class_subject_requirements FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''hod'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "csr_delete_role_gated" ON class_subject_requirements FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- VULN-45: Atomic numbering RPCs for expenses + AP
-- ──────────────────────────────────────────────────────────

-- next_expense_number: atomic counter
CREATE OR REPLACE FUNCTION next_expense_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM pg_advisory_xact_lock(('expense_' || p_school_id || v_yy)::bit(64)::bigint);

  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'EXP', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy)
  DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'EXP-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_expense_number FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_expense_number TO authenticated;

-- next_ap_invoice_number: atomic counter
CREATE OR REPLACE FUNCTION next_ap_invoice_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM pg_advisory_xact_lock(('apinv_' || p_school_id || v_yy)::bit(64)::bigint);

  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'APINV', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy)
  DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'APINV-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_ap_invoice_number FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_ap_invoice_number TO authenticated;

-- next_ap_payment_number: atomic counter
CREATE OR REPLACE FUNCTION next_ap_payment_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM pg_advisory_xact_lock(('appay_' || p_school_id || v_yy)::bit(64)::bigint);

  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'APPAY', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy)
  DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'APPAY-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_ap_payment_number FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_ap_payment_number TO authenticated;

-- next_supplier_number: atomic counter
CREATE OR REPLACE FUNCTION next_supplier_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM pg_advisory_xact_lock(('sup_' || p_school_id || v_yy)::bit(64)::bigint);

  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'SUP', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy)
  DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'SUP-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_supplier_number FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_supplier_number TO authenticated;

-- ──────────────────────────────────────────────────────────
-- VULN-48: Add INSERT/UPDATE policies for documents/exam-papers
-- storage buckets that are missing them (needed for upsert)
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'documents_update_school'
  ) THEN
    CREATE POLICY "documents_update_school"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'documents'
        AND (string_to_array(name, '/'))[1] = (SELECT school_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;
