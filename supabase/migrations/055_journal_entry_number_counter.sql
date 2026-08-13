-- ════════════════════════════════════════════════════════════════════════
-- 055_JOURNAL_ENTRY_NUMBER_COUNTER
-- Fix: duplicate journal entry numbers (409 on journal_entries insert).
-- The app previously computed the next number by reading the entry with the
-- latest created_at and adding 1. 053 backfills many entries with near-identical
-- created_at values, so "latest" was arbitrary and could return a number that
-- already existed — tripping the unique (school_id, entry_no) constraint.
--
-- This migration introduces an ATOMIC per-school counter: the app asks for the
-- next number via an RPC that increments the counter in one statement, so two
-- concurrent posts can never collide.
--
-- Safe to re-run. Run in Supabase → SQL Editor (after 053).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Counter table (one row per school / prefix / 2-digit year) -------------
CREATE TABLE IF NOT EXISTS journal_number_counters (
  school_id    UUID NOT NULL,
  prefix       TEXT NOT NULL DEFAULT 'JE',
  yy           INT  NOT NULL,
  last_number  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, prefix, yy)
);

-- 2. Seed from the highest existing entry number per school / year ----------
INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
SELECT school_id,
       'JE',
       CAST(SPLIT_PART(entry_no, '-', 2) AS INT),
       MAX(CAST(SPLIT_PART(entry_no, '-', 3) AS INT))
FROM journal_entries
WHERE entry_no ~ '^JE-[0-9]{2}-[0-9]+$'
GROUP BY school_id, SPLIT_PART(entry_no, '-', 2)
ON CONFLICT (school_id, prefix, yy)
DO UPDATE SET last_number = GREATEST(journal_number_counters.last_number, EXCLUDED.last_number);

-- 3. Atomic next-number function --------------------------------------------
CREATE OR REPLACE FUNCTION next_journal_number(p_school_id UUID, p_yy INT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    INSERT INTO journal_number_counters (school_id, prefix, yy, last_number)
    VALUES (p_school_id, 'JE', p_yy, 1)
    ON CONFLICT (school_id, prefix, yy)
    DO UPDATE SET last_number = journal_number_counters.last_number + 1
    RETURNING last_number
  )
  SELECT last_number FROM u;
$$;

GRANT EXECUTE ON FUNCTION next_journal_number(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION next_journal_number(UUID, INT) TO anon;
GRANT EXECUTE ON FUNCTION next_journal_number(UUID, INT) TO service_role;
