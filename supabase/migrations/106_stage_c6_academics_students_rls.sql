-- ============================================================================
-- 106_stage_c6_academics_students_rls.sql
-- Stage C6: entitlement-based RLS for Academics & Students sub-modules (Pro).
--
-- Feature-key assignment:
--   cbc_assessments, competency_areas, competency_levels -> academics.cbc_analysis
--   discipline_records                                   -> students.discipline
--   transfer_history                                     -> students.transfers
--   student_documents, fee_structure_items               -> students.records / finance.fees
--        (parent-join tables, no own school_id)
--   alumni_overview view already fixed in 100.
--
-- Pattern per table:
--   SELECT policy: superadmin OR (own school AND my_has_feature(<key>))
--   ALL policy:    superadmin OR (own school AND my_has_feature(<key>) AND role
--                  in admin|bursar|deputy_administrator)
--   CBC keeps its parent-read policy (parents may read their children's CBC).
-- Safe to re-run.
-- ============================================================================

-- ------------------------- academics.cbc_analysis -------------------------
-- keep parent read policy, replace staff_all with gated policies
DROP POLICY IF EXISTS "cbc_assessments_staff_all" ON cbc_assessments;
DROP POLICY IF EXISTS "cbc_assessments_select_gated" ON cbc_assessments;
DROP POLICY IF EXISTS "cbc_assessments_write_gated" ON cbc_assessments;
CREATE POLICY "cbc_assessments_select_gated" ON cbc_assessments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('academics.cbc_analysis')));
CREATE POLICY "cbc_assessments_write_gated" ON cbc_assessments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('academics.cbc_analysis') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator','teacher','class_teacher','registrar'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('academics.cbc_analysis') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator','teacher','class_teacher','registrar'])));

DROP POLICY IF EXISTS "Users can read competency_areas for their school" ON competency_areas;
DROP POLICY IF EXISTS "competency_areas_select_gated" ON competency_areas;
CREATE POLICY "competency_areas_select_gated" ON competency_areas
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('academics.cbc_analysis')));

DROP POLICY IF EXISTS "Users can read competency_levels for their school" ON competency_levels;
DROP POLICY IF EXISTS "competency_levels_select_gated" ON competency_levels;
CREATE POLICY "competency_levels_select_gated" ON competency_levels
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('academics.cbc_analysis')));

-- -------------------------- students.discipline ---------------------------
DROP POLICY IF EXISTS "discipline_delete_role_gated" ON discipline_records;
DROP POLICY IF EXISTS "discipline_insert_role_gated" ON discipline_records;
DROP POLICY IF EXISTS "discipline_select" ON discipline_records;
DROP POLICY IF EXISTS "discipline_update_role_gated" ON discipline_records;
DROP POLICY IF EXISTS "discipline_records_select_gated" ON discipline_records;
DROP POLICY IF EXISTS "discipline_records_write_gated" ON discipline_records;
CREATE POLICY "discipline_records_select_gated" ON discipline_records
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.discipline')));
CREATE POLICY "discipline_records_write_gated" ON discipline_records
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.discipline') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.discipline') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- -------------------------- students.transfers ----------------------------
DROP POLICY IF EXISTS "transfer_history_delete_role_gated" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_insert_role_gated" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_school_isolation" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_select" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_update_role_gated" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_select_gated" ON transfer_history;
DROP POLICY IF EXISTS "transfer_history_write_gated" ON transfer_history;
CREATE POLICY "transfer_history_select_gated" ON transfer_history
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.transfers')));
CREATE POLICY "transfer_history_write_gated" ON transfer_history
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.transfers') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.transfers') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- ------------------- student_documents (parent join) ----------------------
DROP POLICY IF EXISTS "student_documents_delete_role_gated" ON student_documents;
DROP POLICY IF EXISTS "student_documents_insert_role_gated" ON student_documents;
DROP POLICY IF EXISTS "student_documents_school_isolation" ON student_documents;
DROP POLICY IF EXISTS "student_documents_select" ON student_documents;
DROP POLICY IF EXISTS "student_documents_select_gated" ON student_documents;
DROP POLICY IF EXISTS "student_documents_write_gated" ON student_documents;
CREATE POLICY "student_documents_select_gated" ON student_documents
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      student_id IN (SELECT st.id FROM students st WHERE st.school_id = get_my_school_id())
      AND my_has_feature('students.records')
    ));
CREATE POLICY "student_documents_write_gated" ON student_documents
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      student_id IN (SELECT st.id FROM students st WHERE st.school_id = get_my_school_id())
      AND my_has_feature('students.records')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator','registrar'])
    ))
  WITH CHECK (get_my_role() = 'superadmin' OR (
      student_id IN (SELECT st.id FROM students st WHERE st.school_id = get_my_school_id())
      AND my_has_feature('students.records')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator','registrar'])
    ));

-- ------------------ fee_structure_items (parent join) ---------------------
DROP POLICY IF EXISTS "fee_structure_items_school_isolation" ON fee_structure_items;
DROP POLICY IF EXISTS "fee_structure_items_select_gated" ON fee_structure_items;
DROP POLICY IF EXISTS "fee_structure_items_write_gated" ON fee_structure_items;
CREATE POLICY "fee_structure_items_select_gated" ON fee_structure_items
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      fee_structure_id IN (SELECT fs.id FROM fee_structures fs WHERE fs.school_id = get_my_school_id())
      AND my_has_feature('finance.fees')
    ));
CREATE POLICY "fee_structure_items_write_gated" ON fee_structure_items
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (
      fee_structure_id IN (SELECT fs.id FROM fee_structures fs WHERE fs.school_id = get_my_school_id())
      AND my_has_feature('finance.fees')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])
    ))
  WITH CHECK (get_my_role() = 'superadmin' OR (
      fee_structure_id IN (SELECT fs.id FROM fee_structures fs WHERE fs.school_id = get_my_school_id())
      AND my_has_feature('finance.fees')
      AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])
    ));