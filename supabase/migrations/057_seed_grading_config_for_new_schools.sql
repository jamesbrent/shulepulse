-- Migration 057: Auto-seed canonical grading config + exam types for new schools.
-- Fires AFTER INSERT on the `schools` table via a database trigger.
-- Idempotent: skips if grading systems already exist for the school.
--
-- Run this ONCE in the Supabase SQL Editor. The trigger persists permanently.

CREATE OR REPLACE FUNCTION seed_grading_config_for_new_school()
RETURNS trigger AS $$
DECLARE
  v_school  UUID := NEW.id;
  v_early   UUID;
  v_primary UUID;
  v_junior  UUID;
BEGIN
  -- Already seeded — bail out
  IF EXISTS (SELECT 1 FROM grading_systems WHERE school_id = v_school LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- ── Grading systems (canonical four, no default) ─────────────────────────
  INSERT INTO grading_systems (school_id, name, slug, is_default) VALUES
    (v_school, 'Early Years (PP1–Grade 3)',    'early',        false) RETURNING id INTO v_early;
  INSERT INTO grading_systems (school_id, name, slug, is_default) VALUES
    (v_school, 'Upper Primary (Grade 4–6)',    'upperPrimary', false) RETURNING id INTO v_primary;
  INSERT INTO grading_systems (school_id, name, slug, is_default) VALUES
    (v_school, 'Junior Secondary (Grade 7–9)', 'junior',       false) RETURNING id INTO v_junior;
  INSERT INTO grading_systems (school_id, name, slug, is_default) VALUES
    (v_school, 'Senior School (Grade 10–12)',  'senior',       false);

  -- ── Early Years bands (achievement levels, no points) ────────────────────
  INSERT INTO grading_bands (school_id, system_id, grade, label,
                             min_score, max_score, points, color, sort_order) VALUES
    (v_school, v_early, 'EE', 'Exceeding Expectations',    75, 100, 0, '#16a34a', 1),
    (v_school, v_early, 'ME', 'Meeting Expectations',      50,  74, 0, '#2563eb', 2),
    (v_school, v_early, 'AE', 'Approaching Expectations',  25,  49, 0, '#ca8a04', 3),
    (v_school, v_early, 'BE', 'Below Expectations',         0,  24, 0, '#f97316', 4);

  -- ── Upper Primary bands (8-point scale: EE1 8 … BE2 1) ──────────────────
  INSERT INTO grading_bands (school_id, system_id, grade, label,
                             min_score, max_score, points, color, sort_order) VALUES
    (v_school, v_primary, 'EE1', 'Exceptional',         90, 100, 8, '#16a34a', 1),
    (v_school, v_primary, 'EE2', 'Very Good',           80,  89, 7, '#22c55e', 2),
    (v_school, v_primary, 'ME1', 'Good',                70,  79, 6, '#65a30d', 3),
    (v_school, v_primary, 'ME2', 'Fair',                60,  69, 5, '#84cc16', 4),
    (v_school, v_primary, 'AE1', 'Needs Improvement',   50,  59, 4, '#f59e0b', 5),
    (v_school, v_primary, 'AE2', 'Below Average',       40,  49, 3, '#f97316', 6),
    (v_school, v_primary, 'BE1', 'Well Below Average',  30,  39, 2, '#ea580c', 7),
    (v_school, v_primary, 'BE2', 'Minimal Competence',   0,  29, 1, '#dc2626', 8);

  -- ── Junior Secondary bands (same 8-point scale) ─────────────────────────
  INSERT INTO grading_bands (school_id, system_id, grade, label,
                             min_score, max_score, points, color, sort_order) VALUES
    (v_school, v_junior, 'EE1', 'Exceptional',         90, 100, 8, '#16a34a', 1),
    (v_school, v_junior, 'EE2', 'Very Good',           80,  89, 7, '#22c55e', 2),
    (v_school, v_junior, 'ME1', 'Good',                70,  79, 6, '#65a30d', 3),
    (v_school, v_junior, 'ME2', 'Fair',                60,  69, 5, '#84cc16', 4),
    (v_school, v_junior, 'AE1', 'Needs Improvement',   50,  59, 4, '#f59e0b', 5),
    (v_school, v_junior, 'AE2', 'Below Average',       40,  49, 3, '#f97316', 6),
    (v_school, v_junior, 'BE1', 'Well Below Average',  30,  39, 2, '#ea580c', 7),
    (v_school, v_junior, 'BE2', 'Minimal Competence',   0,  29, 1, '#dc2626', 8);

  -- ── Senior School: system row only, no bands (pending official rubric) ───

  -- ── Exam types: Opener /15 15%, Midterm /15 15%, End Term /70 70% ───────
  INSERT INTO exam_type_config (school_id, name, label, max_marks, weightage,
                                description, sort_order) VALUES
    (v_school, 'Opener',  'Opener Assessment',       15, 15,
      'Opening assessment at the start of the term.', 1),
    (v_school, 'Midterm', 'Midterm Assessment',      15, 15,
      'Mid-term assessment covering work to date.',  2),
    (v_school, 'End Term','End of Term Examination', 70, 70,
      'Comprehensive end-of-term examination.',      3);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_grading_config ON schools;
CREATE TRIGGER trg_seed_grading_config AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION seed_grading_config_for_new_school();
