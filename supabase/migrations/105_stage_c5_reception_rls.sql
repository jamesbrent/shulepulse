-- ============================================================================
-- 105_stage_c5_reception_rls.sql
-- Stage C5: entitlement-based RLS for Reception (Pro).
--   visitors, appointments, front_office_requests   -> reception.front_office
--   school_events                                   -> reception.calendar
--
-- Two-layer gate per table (replaces old role-gated + school_isolation sets):
--   SELECT policy:  superadmin OR (own school AND my_has_feature(<key>))
--   ALL policy:     superadmin OR (own school AND my_has_feature(<key>)
--                   AND role in admin|bursar|deputy_administrator)
-- This preserves read access for all own-school staff with the feature while
-- restricting writes to finance-roles.
-- Safe to re-run.
-- ============================================================================

-- visitors
DROP POLICY IF EXISTS "visitors_delete_role_gated" ON visitors;
DROP POLICY IF EXISTS "visitors_insert_role_gated" ON visitors;
DROP POLICY IF EXISTS "visitors_select" ON visitors;
DROP POLICY IF EXISTS "visitors_update_role_gated" ON visitors;
DROP POLICY IF EXISTS "visitors_select_gated" ON visitors;
DROP POLICY IF EXISTS "visitors_write_gated" ON visitors;
CREATE POLICY "visitors_select_gated" ON visitors
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office')));
CREATE POLICY "visitors_write_gated" ON visitors
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- appointments
DROP POLICY IF EXISTS "appointments_school_isolation" ON appointments;
DROP POLICY IF EXISTS "appointments_select_gated" ON appointments;
DROP POLICY IF EXISTS "appointments_write_gated" ON appointments;
CREATE POLICY "appointments_select_gated" ON appointments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office')));
CREATE POLICY "appointments_write_gated" ON appointments
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- front_office_requests
DROP POLICY IF EXISTS "front_office_requests_school_isolation" ON front_office_requests;
DROP POLICY IF EXISTS "front_office_requests_select_gated" ON front_office_requests;
DROP POLICY IF EXISTS "front_office_requests_write_gated" ON front_office_requests;
CREATE POLICY "front_office_requests_select_gated" ON front_office_requests
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office')));
CREATE POLICY "front_office_requests_write_gated" ON front_office_requests
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.front_office') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

-- school_events
DROP POLICY IF EXISTS "school_events_delete_role_gated" ON school_events;
DROP POLICY IF EXISTS "school_events_insert_role_gated" ON school_events;
DROP POLICY IF EXISTS "school_events_select" ON school_events;
DROP POLICY IF EXISTS "school_events_update_role_gated" ON school_events;
DROP POLICY IF EXISTS "school_events_select_gated" ON school_events;
DROP POLICY IF EXISTS "school_events_write_gated" ON school_events;
CREATE POLICY "school_events_select_gated" ON school_events
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.calendar')));
CREATE POLICY "school_events_write_gated" ON school_events
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.calendar') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('reception.calendar') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));