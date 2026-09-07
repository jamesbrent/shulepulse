-- Migration 152: get_setup_snapshot(p_school_id) RPC
-- Backend for the Setup Assistant (Guided Setup). Returns the school config
-- + live on-boarding counts in one school-scoped call, so the client no
-- longer fires ~11 parallel queries.
--
-- SECURITY DEFINER but manually scoped: only a member of that school or a
-- superadmin may call it for a given school. Inside, RLS is bypassed, so we
-- enforce access explicitly (same pattern as create_school_admin_user etc.).

CREATE OR REPLACE FUNCTION get_setup_snapshot(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_school UUID;
  v_school_json JSONB;
  v_classes BIGINT;
  v_subjects BIGINT;
  v_teachers BIGINT;
  v_non_teaching BIGINT;
  v_students BIGINT;
  v_fee_categories BIGINT;
  v_fee_structures BIGINT;
  v_grade_levels BIGINT;
  v_timetable BIGINT;
  v_staff_profiles BIGINT;
  v_parent_profiles BIGINT;
BEGIN
  SELECT role, school_id INTO v_role, v_school
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_role <> 'superadmin' AND p_school_id IS DISTINCT FROM v_school THEN
    RAISE EXCEPTION 'Access denied: school does not belong to you';
  END IF;

  SELECT jsonb_build_object(
    'name', name,
    'type', type,
    'county', county,
    'current_term', current_term,
    'current_year', current_year,
    'logo_url', logo_url
  )
  INTO v_school_json
  FROM schools WHERE id = p_school_id;

  SELECT count(*) INTO v_classes FROM classes WHERE school_id = p_school_id;
  SELECT count(*) INTO v_subjects FROM subjects WHERE school_id = p_school_id;
  SELECT count(*) INTO v_teachers FROM teachers WHERE school_id = p_school_id;
  SELECT count(*) INTO v_non_teaching FROM non_teaching_staff WHERE school_id = p_school_id;
  SELECT count(*) INTO v_students FROM students WHERE school_id = p_school_id;
  SELECT count(*) INTO v_fee_categories FROM fee_categories WHERE school_id = p_school_id;
  SELECT count(*) INTO v_fee_structures FROM fee_structures WHERE school_id = p_school_id;
  SELECT count(*) INTO v_grade_levels FROM grade_levels WHERE school_id = p_school_id;
  SELECT count(*) INTO v_timetable FROM timetable_slots WHERE school_id = p_school_id;

  SELECT count(*) INTO v_staff_profiles FROM profiles
    WHERE school_id = p_school_id
      AND role IN ('admin','deputy_administrator','bursar','registrar','reception','hod','teacher','class_teacher','librarian');

  SELECT count(*) INTO v_parent_profiles FROM profiles
    WHERE school_id = p_school_id AND role = 'parent';

  RETURN jsonb_build_object(
    'school', COALESCE(v_school_json, '{}'::jsonb),
    'counts', jsonb_build_object(
      'classes', v_classes,
      'subjects', v_subjects,
      'teachers', v_teachers,
      'nonTeaching', v_non_teaching,
      'students', v_students,
      'feeCategories', v_fee_categories,
      'feeStructures', v_fee_structures,
      'gradeLevels', v_grade_levels,
      'timetable', v_timetable,
      'staffProfiles', v_staff_profiles,
      'parents', v_parent_profiles
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_setup_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_setup_snapshot(UUID) TO authenticated;