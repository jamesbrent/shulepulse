-- ============================================================================
-- 117_schools_education_levels.sql
-- FEATURE (QA audit Part 7): a school may offer multiple education levels.
--
-- Additive change that preserves backward compatibility:
--   * schools.type stays the single-row "Category" (school_types.name) used
--     everywhere today.
--   * NEW schools.education_levels TEXT[] holds the list of levels a school
--     teaches (e.g. {pre-primary,lower-primary,upper-primary,junior}).
--   * Existing schools are backfilled from their current type when non-empty,
--     so no configuration is lost and nothing requires manual migration.
-- Classes already carry their own per-row `level`, so nothing there changes
-- and NO class data is touched.
-- ============================================================================

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS education_levels TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- Backfill: one-off, safe (only fills empties).
UPDATE schools
SET education_levels = ARRAY[type]
WHERE cardinality(education_levels) = 0
  AND type IS NOT NULL
  AND type <> '';