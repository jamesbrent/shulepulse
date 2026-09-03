-- ─────────────────────────────────────────────────────────────────────────────
-- notice_reads — server-side per-user read tracking (U9)
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- Moves notice "seen" state out of localStorage (notice_last_seen_<userId>)
-- into a per-user, per-notice table so read status is durable across devices.

CREATE TABLE IF NOT EXISTS notice_reads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  notice_id  UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notice_reads_user
  ON notice_reads (user_id);

CREATE INDEX IF NOT EXISTS idx_notice_reads_notice
  ON notice_reads (notice_id);

CREATE INDEX IF NOT EXISTS idx_notice_reads_school
  ON notice_reads (school_id);

ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;

-- Users can read their own read-receipt rows.
CREATE POLICY "notice_reads_user_own"
  ON notice_reads
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','hod','deputy_administrator','superadmin')
    )
  );

-- Users can mark a notice as read (insert a receipt for themselves).
CREATE POLICY "notice_reads_user_insert"
  ON notice_reads
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
