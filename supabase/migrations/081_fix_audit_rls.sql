-- ============================================================
-- 081_fix_audit_rls.sql
-- Fix 42501 'permission denied for table audit_logs' on
-- /superadmin/auditlogs.
--
-- Root cause: 074_security_hardening.sql revoked SELECT, INSERT
-- on audit_logs FROM authenticated. RLS policies cannot restore
-- table-level privileges, so every client read/write failed.
-- ============================================================

-- Enable RLS if not already
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Restore table-level privileges (revoked by 074_security_hardening.sql).
-- Server-side audit triggers run as SECURITY DEFINER and were unaffected,
-- but client-side logAction() inserts and fetchAuditLogs() reads need these.
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Replace legacy SELECT policies from 009_audit_logs.sql so access
-- exactly matches intent: superadmin sees all, school admins see own school.
DROP POLICY IF EXISTS "audit_logs_select_superadmin" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_school_admin" ON audit_logs;

-- Allow superadmin to read all audit logs
DROP POLICY IF EXISTS "audit_logs_superadmin_read" ON audit_logs;
CREATE POLICY "audit_logs_superadmin_read" ON audit_logs
  FOR SELECT USING (get_my_role() = 'superadmin');

-- Allow school admins to read their own school's logs
DROP POLICY IF EXISTS "audit_logs_school_read" ON audit_logs;
CREATE POLICY "audit_logs_school_read" ON audit_logs
  FOR SELECT USING (
    school_id = get_my_school_id()
    AND get_my_role() IN ('admin', 'deputy_administrator', 'superadmin')
  );
