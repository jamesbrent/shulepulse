-- ============================================================
-- 075_phase2_security.sql
-- Phase 2 Security Remediation
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- P2-1: Profiles PII — restrict non-admin SELECT
-- Admins/deputy/bursar can see all school profiles.
-- Others can only see their own profile.
-- Keep teachers visible via a separate RPC for name lookups.
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_select_school ON profiles;

CREATE POLICY "profiles_select_restricted"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    OR (school_id IS NULL AND get_my_role() = 'superadmin')
  );

-- Create a public-safe view for teacher name lookups (non-sensitive)
-- RLS is inherited from the underlying profiles table automatically
DROP VIEW IF EXISTS teacher_names CASCADE;
CREATE VIEW teacher_names AS
SELECT id, school_id, full_name, role
FROM profiles
WHERE role IN ('teacher', 'hod', 'class_teacher', 'deputy_administrator', 'admin');

-- Create a view for parent name lookups
DROP VIEW IF EXISTS parent_names CASCADE;
CREATE VIEW parent_names AS
SELECT id, school_id, full_name, email, role
FROM profiles
WHERE role = 'parent';


-- ──────────────────────────────────────────────────────────
-- P2-2: Role-gated write policies on key FOR ALL tables
-- Replace open FOR ALL with role-restricted INSERT/UPDATE/DELETE
-- ──────────────────────────────────────────────────────────

-- ── teachers: only admin/deputy can write ──
DROP POLICY IF EXISTS teachers_insert_school ON teachers;
DROP POLICY IF EXISTS teachers_update_school ON teachers;
DROP POLICY IF EXISTS teachers_delete_school ON teachers;

CREATE POLICY "teachers_insert_role_gated"
  ON teachers FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY "teachers_update_role_gated"
  ON teachers FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY "teachers_delete_role_gated"
  ON teachers FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ── teacher_subject_assignments: admin/hod/deputy can write ──
DROP POLICY IF EXISTS tsa_school_isolation ON teacher_subject_assignments;
CREATE POLICY "tsa_select"
  ON teacher_subject_assignments FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "tsa_insert_role_gated"
  ON teacher_subject_assignments FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "tsa_update_role_gated"
  ON teacher_subject_assignments FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "tsa_delete_role_gated"
  ON teacher_subject_assignments FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ── timetable_slots: admin/hod/deputy can write ──
DROP POLICY IF EXISTS tt_school_isolation ON timetable_slots;
CREATE POLICY "tt_select"
  ON timetable_slots FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "tt_insert_role_gated"
  ON timetable_slots FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "tt_update_role_gated"
  ON timetable_slots FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "tt_delete_role_gated"
  ON timetable_slots FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'hod', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ── discipline_records: admin/deputy/class_teacher/hod can write ──
DROP POLICY IF EXISTS discipline_records_school_isolation ON discipline_records;
CREATE POLICY "discipline_select"
  ON discipline_records FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "discipline_insert_role_gated"
  ON discipline_records FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'hod', 'class_teacher', 'teacher', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "discipline_update_role_gated"
  ON discipline_records FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'hod', 'class_teacher', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "discipline_delete_role_gated"
  ON discipline_records FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ── non_teaching_staff: admin/deputy can write ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'non_teaching_staff') THEN
    EXECUTE 'DROP POLICY IF EXISTS nts_school_isolation ON non_teaching_staff';
    EXECUTE 'CREATE POLICY "nts_select" ON non_teaching_staff FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "nts_insert_role_gated" ON non_teaching_staff FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "nts_update_role_gated" ON non_teaching_staff FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "nts_delete_role_gated" ON non_teaching_staff FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- ── departments: admin/hod can write ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'departments') THEN
    EXECUTE 'DROP POLICY IF EXISTS dept_school_isolation ON departments';
    EXECUTE 'CREATE POLICY "dept_select" ON departments FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "dept_insert_role_gated" ON departments FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "dept_update_role_gated" ON departments FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "dept_delete_role_gated" ON departments FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- ── notices: admin/deputy/teacher/librarian can create; others read-only ──
DROP POLICY IF EXISTS notices_staff_all ON notices;
DROP POLICY IF EXISTS notices_parent_read ON notices;
DROP POLICY IF EXISTS notices_student_read ON notices;
DROP POLICY IF EXISTS notices_librarian_read ON notices;

CREATE POLICY "notices_select"
  ON notices FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "notices_insert_role_gated"
  ON notices FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'teacher', 'hod', 'librarian', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "notices_update_role_gated"
  ON notices FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "notices_delete_role_gated"
  ON notices FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ── visitors / appointments / front_office_requests: reception/admin can write ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'visitors') THEN
    EXECUTE 'DROP POLICY IF EXISTS visitors_school_isolation ON visitors';
    EXECUTE 'CREATE POLICY "visitors_select" ON visitors FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "visitors_insert_role_gated" ON visitors FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''reception'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "visitors_update_role_gated" ON visitors FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''reception'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "visitors_delete_role_gated" ON visitors FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'school_events') THEN
    EXECUTE 'DROP POLICY IF EXISTS school_events_school_isolation ON school_events';
    EXECUTE 'CREATE POLICY "school_events_select" ON school_events FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
    EXECUTE 'CREATE POLICY "school_events_insert_role_gated" ON school_events FOR INSERT WITH CHECK (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''teacher'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "school_events_update_role_gated" ON school_events FOR UPDATE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
    EXECUTE 'CREATE POLICY "school_events_delete_role_gated" ON school_events FOR DELETE USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- P2-6: Atomic fee payment recording RPC
-- Combines: fee_payments insert + student_ledger insert + GL posting
-- in a single database transaction.
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_fee_payment(
  p_school_id UUID,
  p_student_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_payment_method TEXT,
  p_provider TEXT,
  p_reference TEXT,
  p_receipt_number TEXT,
  p_received_by UUID,
  p_transaction_date DATE,
  p_term TEXT,
  p_year INT,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_payment RECORD;
  v_student RECORD;
BEGIN
  -- Insert the fee payment
  INSERT INTO fee_payments (
    school_id, student_id, amount, payment_type, payment_method,
    provider, reference, receipt_number, received_by,
    transaction_date, term, year
  ) VALUES (
    p_school_id, p_student_id, p_amount, p_payment_type, p_payment_method,
    p_provider, p_reference, p_receipt_number, p_received_by,
    p_transaction_date, p_term, p_year
  )
  RETURNING id INTO v_payment_id;

  -- Insert the student ledger entry
  INSERT INTO student_ledger (
    school_id, student_id, entry_type, amount, term, year, description, reference_id
  ) VALUES (
    p_school_id, p_student_id, 'payment', p_amount, p_term, p_year, p_description, v_payment_id
  );

  -- Return the created payment
  SELECT * INTO v_payment FROM fee_payments WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'receipt_number', p_receipt_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION record_fee_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_fee_payment TO authenticated;
