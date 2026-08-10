-- ─────────────────────────────────────────────────────────────────────────────
-- Audit logs table for tracking superadmin actions
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  details       JSONB DEFAULT '{}',
  performed_by  UUID REFERENCES profiles(id),
  performed_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Superadmin can insert and read all audit logs
CREATE POLICY "audit_logs_insert_superadmin" ON audit_logs
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "audit_logs_select_superadmin" ON audit_logs
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- School admins can read logs for their own school
CREATE POLICY "audit_logs_select_school_admin" ON audit_logs
  FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
