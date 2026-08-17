-- Migration 058: Grant librarian read-only access to notices.
-- Librarians can view school notices but cannot create/delete them.

CREATE POLICY "notices_librarian_read"
  ON notices FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'librarian'
  );
