-- Migration 062: Seed CBC/CBE curriculum subjects with curriculum_level.
-- Creates a stored function that inserts all CBC subjects for a given school.
-- Usage: SELECT seed_cbc_subjects('<school-uuid>');
-- The function skips subjects that already exist for the school.

CREATE OR REPLACE FUNCTION seed_cbc_subjects(p_school_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_added INTEGER := 0;
  v_subj RECORD;
  v_level TEXT;
  v_category TEXT;
  v_code TEXT;
BEGIN
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
$$;
