-- Migration 059: Seed Kenya school categories into school_types.
INSERT INTO school_types (name) VALUES
  ('Pre-Primary Education (PP1–PP2)'),
  ('Primary Education (Grades 1–6)'),
  ('Junior Secondary School / JSS (Grades 7–9)'),
  ('Senior Secondary School / SSS (Grades 10–12)'),
  ('Mixed (Primary + Secondary)')
ON CONFLICT DO NOTHING;
