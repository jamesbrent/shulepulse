-- Migration 061: Enhance timetable for CBC/CBE grade-aware subjects,
-- double lessons, and practical lesson support.
-- All changes are additive — no existing data is modified or deleted.
-- NOTE: Venues/rooms removed from this release — coming in a future update.

-- ═══════════════════════════════════════════════════════════
-- 1. SUBJECTS — add curriculum_level
-- ═══════════════════════════════════════════════════════════
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS curriculum_level TEXT DEFAULT 'all';

-- ═══════════════════════════════════════════════════════════
-- 2. CLASS SUBJECT REQUIREMENTS — add lesson config fields
-- ═══════════════════════════════════════════════════════════
ALTER TABLE class_subject_requirements
  ADD COLUMN IF NOT EXISTS lesson_type TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS doubles_per_week INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practical BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consecutive_required BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- 3. TIMETABLE SLOTS — add double lesson support
-- ═══════════════════════════════════════════════════════════
ALTER TABLE timetable_slots
  ADD COLUMN IF NOT EXISTS is_double BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lesson_group_id UUID;

-- Index on lesson_group_id for quick lookup of linked double lessons
CREATE INDEX IF NOT EXISTS idx_tt_lesson_group ON timetable_slots(lesson_group_id);
