-- ============================================================================
-- 107_stage_c7_hr_rls.sql
-- Stage C7: entitlement-based RLS for the HR module.
--
--   teachers, non_teaching_staff, departments          keep Basic SELECT
--     (hr.staff_directory - own school, any staff role), writes gated to
--     hr.staff_management (Pro) + admin|deputy_administrator
--   teacher_subject_assignments, class_subject_requirements -> hr.staff_management (Pro),
--     reads + writes gated (original write roles admin|hod|deputy_administrator kept)
--   class_comments, teacher_comments                    -> hr.comments (Pro)
--     reads + writes gated, school-scoped (original had no role restriction)
--
-- Also carries faithfulness corrections for Stage C6 write-gates (restore the
-- EXACT original role sets + feature):
--   discipline_records  writes -> admin|deputy_administrator|hod|class_teacher|teacher|registrar
--   transfer_history    writes -> admin|deputy_administrator
--   student_documents   writes -> admin|deputy_administrator|teacher|class_teacher|registrar
-- Safe to re-run.
-- ============================================================================

-- ============================ C6 faithfulness fixes ============================
DROP POLICY IF EXISTS "discipline_records_write_gated" ON discipline_records;
CREATE POLICY "discipline_records_write_gated" ON discipline_records
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.discipline') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','hod','class_teacher','teacher','registrar'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.discipline') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','hod','class_teacher','teacher','registrar'])));

DROP POLICY IF EXISTS "transfer_history_write_gated" ON transfer_history;
CREATE POLICY "transfer_history_write_gated" ON transfer_history
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.transfers') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.transfers') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])));

DROP POLICY IF EXISTS "student_documents_write_gated" ON student_documents;
CREATE POLICY "student_documents_write_gated" ON student_documents
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      student_id IN (SELECT st.id FROM students st WHERE st.school_id = get_my_school_id())
      AND my_has_feature('students.records')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','teacher','class_teacher','registrar'])
    ))
  WITH CHECK (get_my_role() = 'superadmin' OR (
      student_id IN (SELECT st.id FROM students st WHERE st.school_id = get_my_school_id())
      AND my_has_feature('students.records')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','teacher','class_teacher','registrar'])
    ));

-- ======================= teachers / departments / nts =========================
-- keep select policies; gate writes to hr.staff_management
DROP POLICY IF EXISTS "teachers_delete_role_gated" ON teachers;
DROP POLICY IF EXISTS "teachers_insert_role_gated" ON teachers;
DROP POLICY IF EXISTS "teachers_isolation" ON teachers;
DROP POLICY IF EXISTS "teachers_update_role_gated" ON teachers;
DROP POLICY IF EXISTS "teachers_write_gated" ON teachers;
CREATE POLICY "teachers_write_gated" ON teachers
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])));

DROP POLICY IF EXISTS "dept_delete_role_gated" ON departments;
DROP POLICY IF EXISTS "dept_insert_role_gated" ON departments;
DROP POLICY IF EXISTS "dept_update_role_gated" ON departments;
DROP POLICY IF EXISTS "dept_write_gated" ON departments;
CREATE POLICY "dept_write_gated" ON departments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])));

DROP POLICY IF EXISTS "nts_delete_role_gated" ON non_teaching_staff;
DROP POLICY IF EXISTS "nts_insert_role_gated" ON non_teaching_staff;
DROP POLICY IF EXISTS "nts_update_role_gated" ON non_teaching_staff;
DROP POLICY IF EXISTS "nts_write_gated" ON non_teaching_staff;
CREATE POLICY "nts_write_gated" ON non_teaching_staff
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','deputy_administrator'])));

-- ==================== teacher_subject_assignments / csr =======================
DROP POLICY IF EXISTS "class_subject_requirements_isolation" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_delete_role_gated" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_insert_role_gated" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_select" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_update_role_gated" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_select_gated" ON class_subject_requirements;
DROP POLICY IF EXISTS "csr_write_gated" ON class_subject_requirements;
CREATE POLICY "csr_select_gated" ON class_subject_requirements
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management')));
CREATE POLICY "csr_write_gated" ON class_subject_requirements
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','hod','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','hod','deputy_administrator'])));

DROP POLICY IF EXISTS "teacher_subject_assignments_isolation" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_delete_role_gated" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_insert_role_gated" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_select" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_update_role_gated" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_select_gated" ON teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_write_gated" ON teacher_subject_assignments;
CREATE POLICY "tsa_select_gated" ON teacher_subject_assignments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management')));
CREATE POLICY "tsa_write_gated" ON teacher_subject_assignments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','hod','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.staff_management') AND get_my_role() = ANY (ARRAY['admin','hod','deputy_administrator'])));

-- ============================ class / teacher comments =========================
DROP POLICY IF EXISTS "Users can delete their school's class_comments" ON class_comments;
DROP POLICY IF EXISTS "Users can insert their school's class_comments" ON class_comments;
DROP POLICY IF EXISTS "Users can view their school's class_comments" ON class_comments;
DROP POLICY IF EXISTS "class_comments_school_isolation" ON class_comments;
DROP POLICY IF EXISTS "class_comments_select_gated" ON class_comments;
DROP POLICY IF EXISTS "class_comments_write_gated" ON class_comments;
CREATE POLICY "class_comments_select_gated" ON class_comments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')));
CREATE POLICY "class_comments_write_gated" ON class_comments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')));

DROP POLICY IF EXISTS "Users can delete their school's teacher_comments" ON teacher_comments;
DROP POLICY IF EXISTS "Users can insert their school's teacher_comments" ON teacher_comments;
DROP POLICY IF EXISTS "Users can update their school's teacher_comments" ON teacher_comments;
DROP POLICY IF EXISTS "Users can view their school's teacher_comments" ON teacher_comments;
DROP POLICY IF EXISTS "teacher_comments_select_gated" ON teacher_comments;
DROP POLICY IF EXISTS "teacher_comments_write_gated" ON teacher_comments;
CREATE POLICY "teacher_comments_select_gated" ON teacher_comments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')));
CREATE POLICY "teacher_comments_write_gated" ON teacher_comments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('hr.comments')));