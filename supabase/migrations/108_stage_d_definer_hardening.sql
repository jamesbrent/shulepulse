-- ============================================================================
-- 108_stage_d_definer_hardening.sql
-- Stage D: harden the SECURITY DEFINER / exposed RPC surface.
--
--   * promote_students        - was DEFINER without SET search_path and with
--                               NO caller authorization (cross-school writes
--                               for anyone who could invoke it). Now:
--                               search_path set, school binding + students.promotion gate.
--   * next_journal_number     - now gates on finance.journal + school binding.
--   * next_receipt_number     - gate finance.receipts + school binding.
--   * next_expense_number     - gate finance.expenses + school binding.
--   * next_ap_invoice_number /
--     next_ap_payment_number /
--     next_supplier_number    - gate finance.ap + school binding.
--   * next_book_copy_codes    - gate library.catalogue (school already self-resolved).
--   * seed_default_tax_rules  - gate finance.ap + school binding.
--   * seed_cbc_subjects       - gate academics.cbc_analysis + school binding (invoker).
--   * grant hardening         - REVOKE EXECUTE from PUBLIC/anon on all API RPCs;
--                               GRANT only to authenticated + service_role.
-- Shared guard: public.guard_school_access(p_school_id, feature_key) (INVOKER),
-- superadmin bypass preserved. Safe to re-run.
-- ============================================================================

-- ============================ shared permission guard ============================
CREATE OR REPLACE FUNCTION public.guard_school_access(p_school_id uuid, p_feature_key text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Backend/service provisioning contexts carry no auth.uid() (e.g. the
  -- AFTER-INSERT school seed triggers fired during service-role school
  -- creation). In DEFINER context, current_user='postgres', but auth.uid()
  -- returns NULL for service-role; get_my_role() returns NULL. Bypass here.
  IF get_my_role() IS NULL AND current_user IN ('postgres','supabase_admin','service_role') THEN RETURN; END IF;
  IF get_my_role() = 'superadmin' THEN RETURN; END IF;
  IF get_my_school_id() IS DISTINCT FROM p_school_id THEN
    RAISE EXCEPTION 'permission denied: not your school' USING ERRCODE = '42501';
  END IF;
  IF p_feature_key IS NOT NULL AND NOT my_has_feature(p_feature_key) THEN
    RAISE EXCEPTION 'permission denied: feature % not enabled for this school''s plan', p_feature_key USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- ============================ promote_students ============================
DROP FUNCTION IF EXISTS public.promote_students(uuid, uuid[], uuid);
CREATE OR REPLACE FUNCTION public.promote_students(p_school_id uuid, p_student_ids uuid[], p_promoted_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_promoted JSONB;
  v_grade RECORD;
  v_student RECORD;
  v_errors TEXT[] := '{}';
  v_count INT := 0;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'students.promotion');
  IF get_my_role() <> 'superadmin' AND p_promoted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'promoted_by must be the current user' USING ERRCODE = '42501';
  END IF;
  FOR v_student IN
    SELECT s.id, s.class, gl.name AS next_class
    FROM students s
    LEFT JOIN grade_levels gl_current ON gl_current.school_id = p_school_id AND gl_current.name = s.class
    LEFT JOIN grade_levels gl_next ON gl_next.school_id = p_school_id AND gl_next.promotion_order = gl_current.promotion_order + 1
    WHERE s.id = ANY(p_student_ids) AND s.school_id = p_school_id
  LOOP
    IF v_student.next_class IS NULL THEN
      v_errors := array_append(v_errors, format('Student %s (%s) at final grade "%s"', v_student.id, v_student.class, v_student.class));
      CONTINUE;
    END IF;
    UPDATE students SET class = v_student.next_class, updated_at = v_now, updated_by = p_promoted_by WHERE id = v_student.id;
    INSERT INTO promotion_history (school_id, student_id, from_class, to_class, promoted_by, promoted_at)
    VALUES (p_school_id, v_student.id, v_student.class, v_student.next_class, p_promoted_by, v_now);
    v_count := v_count + 1;
  END LOOP;
  v_promoted := jsonb_build_object(
    'promoted', v_count,
    'errors', CASE WHEN array_length(v_errors, 1) > 0 THEN to_jsonb(v_errors) ELSE '[]'::jsonb END
  );
  RETURN v_promoted;
END;
$function$;

-- ============================ number generators ============================
CREATE OR REPLACE FUNCTION public.next_journal_number(p_school_id uuid, p_yy integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_last INT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.journal');
  WITH u AS (
    INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
    VALUES (p_school_id, 'JE', p_yy, 1)
    ON CONFLICT (school_id, prefix, yy) DO UPDATE SET last_number = journal_number_counters.last_number + 1
    RETURNING last_number
  )
  SELECT last_number INTO v_last FROM u;
  RETURN v_last;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'RCP';
  v_year TEXT := to_char(now(), 'YY');
  v_seq INT;
  v_receipt TEXT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.receipts');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || 'receipt' || v_year))::bit(64)::bigint);
  SELECT COALESCE(MAX( CAST(split_part(receipt_number, '-', 3) AS INT) ), 0) + 1 INTO v_seq
  FROM fee_payments WHERE school_id = p_school_id AND receipt_number LIKE v_prefix || '-' || v_year || '-%';
  v_receipt := v_prefix || '-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN v_receipt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_expense_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.expenses');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || v_yy || 'expense'))::bit(64)::bigint);
  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'EXP', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy) DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'EXP-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_ap_invoice_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.ap');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || v_yy || 'apinv'))::bit(64)::bigint);
  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'APINV', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy) DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'APINV-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_ap_payment_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.ap');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || v_yy || 'appay'))::bit(64)::bigint);
  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'APPAY', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy) DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'APPAY-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_supplier_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_yy TEXT := to_char(current_date, 'YY');
  v_next INT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.ap');
  PERFORM pg_advisory_xact_lock(('x' || md5(p_school_id::text || v_yy || 'supplier'))::bit(64)::bigint);
  INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
  VALUES (p_school_id, 'SUP', v_yy::int, 1)
  ON CONFLICT (school_id, prefix, yy) DO UPDATE SET last_number = journal_number_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'SUP-' || v_yy || '-' || lpad(v_next::text, 5, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_book_copy_codes(p_prefix text, p_count integer)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_school_id UUID;
  v_code TEXT;
  v_i INTEGER;
  v_j INTEGER;
  v_attempts INTEGER;
BEGIN
  SELECT school_id INTO v_school_id FROM profiles WHERE id = auth.uid();
  IF NOT (get_my_role() = 'superadmin' OR (v_school_id IS NOT NULL AND my_has_feature('library.catalogue'))) THEN
    RAISE EXCEPTION 'permission denied: library.catalogue not enabled' USING ERRCODE = '42501';
  END IF;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'No school found for current user'; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _new_copy_codes(code TEXT);
  TRUNCATE _new_copy_codes;
  FOR v_i IN 1..p_count LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_code := upper(p_prefix) || '-';
      FOR v_j IN 1..6 LOOP
        v_code := v_code || substring(v_chars FROM (1 + floor(random() * length(v_chars))::int) FOR 1);
      END LOOP;
      EXIT WHEN v_attempts >= 50 OR (
        NOT EXISTS (SELECT 1 FROM library_book_copies c WHERE c.school_id = v_school_id AND c.copy_code = v_code)
        AND NOT EXISTS (SELECT 1 FROM _new_copy_codes t WHERE t.code = v_code)
      );
    END LOOP;
    INSERT INTO _new_copy_codes(code) VALUES (v_code);
  END LOOP;
  RETURN QUERY SELECT t.code FROM _new_copy_codes t;
END;
$function$;

-- ============================ seed functions ============================
CREATE OR REPLACE FUNCTION public.seed_default_tax_rules(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'finance.ap');
  IF EXISTS (SELECT 1 FROM tax_rules WHERE school_id = p_school_id) THEN
    RETURN;
  END IF;

  INSERT INTO tax_rules
    (school_id, rule_type, tax_class, description, asset_classification,
     rate, first_year_rate, calc_method, effective_date, source_reference, is_active)
  VALUES
    -- Wear & Tear classes (Income Tax Act (Cap 470) — Second Schedule)
    (p_school_id, 'wear_tear', 'class_i', 'Class I',
     'Computers, word processors, calculators, copiers, duplicating machines and other electronic/data-processing equipment',
     37.5, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class I (as amended)', true),
    (p_school_id, 'wear_tear', 'class_ii', 'Class II',
     'Self-propelling and other machines and plant (incl. manufacturing machinery, construction and earth-moving equipment)',
     30, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class II (as amended)', true),
    (p_school_id, 'wear_tear', 'class_iii', 'Class III',
     'Motor vehicles and heavy earth-moving equipment (non-self-propelling)',
     25, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class III (as amended)', true),
    (p_school_id, 'wear_tear', 'class_iv', 'Class IV',
     'Furniture, fixtures and general fittings',
     12.5, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class IV (as amended)', true),

    -- Investment allowance — Buildings (Investment Deduction; verify rates
    -- against the applicable Finance Act and update via Tax Rules admin).
    (p_school_id, 'investment', 'inv_b_hotel', 'Buildings — Hotel buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_manufacture', 'Buildings — Buildings used for manufacture', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_hospital', 'Buildings — Hospital buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_petroleum', 'Buildings — Petroleum/gas storage facilities', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_educational', 'Buildings — Educational buildings incl. student hostels', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_commercial', 'Buildings — Commercial buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_industrial', 'Buildings — Industrial buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_other', 'Buildings — Other qualifying buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),

    -- Investment allowance — Machinery
    (p_school_id, 'investment', 'inv_m_manufacture', 'Machinery — Machinery used for manufacture', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_hospital', 'Machinery — Hospital equipment', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_ships_aircraft', 'Machinery — Ships/aircraft', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_motor_vehicles', 'Machinery — Motor vehicles and heavy earth-moving equipment', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_computers', 'Machinery — Computer and peripheral computer hardware/software', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_copiers', 'Machinery — Calculators, copiers and duplicating machines', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_other', 'Machinery — Other qualifying machinery', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_cbc_subjects(p_school_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_added INTEGER := 0;
  v_subj RECORD;
  v_level TEXT;
  v_category TEXT;
  v_code TEXT;
BEGIN
  PERFORM public.guard_school_access(p_school_id, 'academics.cbc_analysis');
  -- Pre-Primary
  FOR v_subj IN SELECT * FROM (VALUES
    ('Language Activities',       'LAN',  'core'),
    ('Mathematical Activities',   'MATH', 'core'),
    ('Creative Activities',       'CRE',  'elective'),
    ('Environmental Activities',  'ENV',  'elective'),
    ('Religious Activities',      'REL',  'core'),
    ('Pastoral Programme',        'PST',  'support')
  ) AS t(name, code, category)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = p_school_id AND LOWER(name) = LOWER(v_subj.name)) THEN
      INSERT INTO subjects (school_id, name, code, category, curriculum_level)
      VALUES (p_school_id, v_subj.name, v_subj.code, v_subj.category, 'pre-primary');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  -- Lower Primary (Grade 1-3)
  FOR v_subj IN SELECT * FROM (VALUES
    ('English',                  'ENG',  'core'),
    ('Kiswahili/KSL',           'KIS',  'core'),
    ('Mathematics',              'MATH', 'core'),
    ('Creative Activities',      'CRE',  'elective'),
    ('Environmental Activities', 'ENV',  'elective'),
    ('Religious Education',      'REL',  'core'),
    ('Indigenous Language',      'IND',  'elective'),
    ('Pastoral Programme',       'PST',  'support')
  ) AS t(name, code, category)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = p_school_id AND LOWER(name) = LOWER(v_subj.name)) THEN
      INSERT INTO subjects (school_id, name, code, category, curriculum_level)
      VALUES (p_school_id, v_subj.name, v_subj.code, v_subj.category, 'lower-primary');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  -- Upper Primary (Grade 4-6)
  FOR v_subj IN SELECT * FROM (VALUES
    ('English',                  'ENG',  'core'),
    ('Kiswahili',                'KIS',  'core'),
    ('Mathematics',              'MATH', 'core'),
    ('Creative Activities',      'CRE',  'elective'),
    ('Environmental Activities', 'ENV',  'elective'),
    ('Religious Education',      'REL',  'core'),
    ('Social Studies',           'SST',  'elective'),
    ('Science & Technology',     'SCI',  'core'),
    ('Pastoral Programme',       'PST',  'support')
  ) AS t(name, code, category)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = p_school_id AND LOWER(name) = LOWER(v_subj.name)) THEN
      INSERT INTO subjects (school_id, name, code, category, curriculum_level)
      VALUES (p_school_id, v_subj.name, v_subj.code, v_subj.category, 'upper-primary');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  -- Junior School (Grade 7-9)
  FOR v_subj IN SELECT * FROM (VALUES
    ('English',                  'ENG',  'core'),
    ('Kiswahili',                'KIS',  'core'),
    ('Mathematics',              'MATH', 'core'),
    ('Integrated Science',       'SCI',  'core'),
    ('Creative Arts & Sports',   'CAS',  'elective'),
    ('Social Studies',           'SST',  'elective'),
    ('Agriculture & Nutrition',  'AGRI', 'practical'),
    ('Pre-Technical Studies',    'PTS',  'practical'),
    ('Religious Education',      'REL',  'core'),
    ('Pastoral Programme',       'PST',  'support')
  ) AS t(name, code, category)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = p_school_id AND LOWER(name) = LOWER(v_subj.name)) THEN
      INSERT INTO subjects (school_id, name, code, category, curriculum_level)
      VALUES (p_school_id, v_subj.name, v_subj.code, v_subj.category, 'junior');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  -- Senior School (Grade 10-11) — core only; pathways are school-specific
  FOR v_subj IN SELECT * FROM (VALUES
    ('English',                      'ENG',  'core'),
    ('Kiswahili',                    'KIS',  'core'),
    ('Mathematics',                  'MATH', 'core'),
    ('Physical Education',           'PE',   'practical'),
    ('ICT',                          'ICT',  'practical'),
    ('Community Service Learning',   'CSL',  'support'),
    ('Pastoral Programme',           'PST',  'support'),
    ('Guidance & Counselling',       'G&C',  'support')
  ) AS t(name, code, category)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = p_school_id AND LOWER(name) = LOWER(v_subj.name)) THEN
      INSERT INTO subjects (school_id, name, code, category, curriculum_level)
      VALUES (p_school_id, v_subj.name, v_subj.code, v_subj.category, 'senior');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN v_added;
END;
$function$;

-- ============================ grant hardening ============================
REVOKE EXECUTE ON FUNCTION public.promote_students(uuid, uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_journal_number(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_receipt_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_expense_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_ap_invoice_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_ap_payment_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_supplier_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_book_copy_codes(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_tax_rules(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_cbc_subjects(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_payments(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_payment_method_breakdown() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_revenue_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_school_admin_user(text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_school_features(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_school_plan(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_has_feature(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_school_access(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.promote_students(uuid, uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_journal_number(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_expense_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_ap_invoice_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_ap_payment_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_supplier_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_book_copy_codes(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_tax_rules(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_cbc_subjects(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_payments(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_method_breakdown() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_school_admin_user(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_features(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_school_plan(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_has_feature(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_school_access(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';