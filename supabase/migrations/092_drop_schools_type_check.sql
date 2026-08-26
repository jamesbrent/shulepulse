-- Migration 092: Drop schools_type_check constraint
-- The school_types lookup table now has full Kenyan category names
-- (e.g. "Primary Education (Grades 1–6)") which violate the old CHECK.

ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_type_check;
