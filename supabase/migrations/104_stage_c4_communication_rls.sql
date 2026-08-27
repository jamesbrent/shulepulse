-- ============================================================================
-- 104_stage_c4_communication_rls.sql
-- Stage C4: entitlement-based RLS for communication (Pro).
-- parent_messages -> communication.messages.
-- Rule: superadmin OR (own school AND my_has_feature + admin|bursar|deputy_admin).
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "parent_messages_school_isolation" ON parent_messages;
DROP POLICY IF EXISTS "parent_messages_entitlement_forall" ON parent_messages;
CREATE POLICY "parent_messages_entitlement_forall" ON parent_messages
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('communication.messages') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('communication.messages') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));