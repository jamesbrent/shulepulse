-- ─────────────────────────────────────────────────────────────────────────────
-- 150_fee_notice_student_id.sql
-- Associate a notice with a specific student so that child-specific notices
-- (e.g. fee balance reminders created in the Finance → Debtors screen) can be
-- shown only to that student's parents.
--
-- Model:
--   * notices.student_id IS NULL  → school-wide notice (everyone sees it)
--   * notices.student_id = <id>   → child-specific; parents see it only when
--                                   that student is one of their linked children
--
-- Append-only; run in the Supabase SQL editor. Existing fee reminders already in
-- the database have student_id = NULL and will remain visible to all parents;
-- resend them from the Debtors screen after this migration to make them per-child.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notices ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notices_student ON notices(student_id);
