-- Fix 1: Re-create parent_messages policy (idempotent)
DROP POLICY IF EXISTS parent_messages_school_isolation ON parent_messages;
CREATE POLICY parent_messages_school_isolation ON parent_messages FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Fix 2: Re-create class_comments policy (idempotent)
DROP POLICY IF EXISTS class_comments_school_isolation ON class_comments;
CREATE POLICY class_comments_school_isolation ON class_comments FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Fix 3: Update attendance CHECK constraint to allow 'excused' status
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'absent', 'late', 'excused'));
