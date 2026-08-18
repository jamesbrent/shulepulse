-- Migration 061: Enhance timetable for CBC/CBE grade-aware subjects,
-- rooms, double lessons, and practical lesson support.
-- All changes are additive — no existing data is modified or deleted.

-- ═══════════════════════════════════════════════════════════
-- 1. ROOMS TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'classroom',
  capacity INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_rooms_school ON rooms(school_id);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_school_isolation ON rooms;
CREATE POLICY rooms_school_isolation
  ON rooms
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ═══════════════════════════════════════════════════════════
-- 2. SUBJECTS — add curriculum_level
-- ═══════════════════════════════════════════════════════════
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS curriculum_level TEXT DEFAULT 'all';

-- ═══════════════════════════════════════════════════════════
-- 3. CLASS SUBJECT REQUIREMENTS — add lesson config fields
-- ═══════════════════════════════════════════════════════════
ALTER TABLE class_subject_requirements
  ADD COLUMN IF NOT EXISTS lesson_type TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS doubles_per_week INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practical BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consecutive_required BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- 4. TIMETABLE SLOTS — add room, double lesson support
-- ═══════════════════════════════════════════════════════════
ALTER TABLE timetable_slots
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_double BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lesson_group_id UUID;

-- Index on lesson_group_id for quick lookup of linked double lessons
CREATE INDEX IF NOT EXISTS idx_tt_lesson_group ON timetable_slots(lesson_group_id);
CREATE INDEX IF NOT EXISTS idx_tt_room ON timetable_slots(room_id);
