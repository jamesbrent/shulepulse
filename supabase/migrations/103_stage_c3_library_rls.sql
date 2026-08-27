-- ============================================================================
-- 103_stage_c3_library_rls.sql
-- Stage C3: entitlement-based RLS for the Library module (Pro).
--
-- Rule (same as C1/C2): superadmin bypass OR (own school AND my_has_feature()
-- AND role in admin|bursar|deputy_administrator). Replaces old `library_*_school`
-- permissive policies (which let ANY own-school staff write) with one FOR ALL
-- policy per table.
--
-- Feature-key assignment:
--   library_books, library_book_copies, library_categories, library_shelves,
--   library_settings, library_rules     -> library.catalogue
--   library_members, library_loans, library_reservations -> library.circulation
-- (library_fines does not exist in this schema; excluded.)
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "library_books_school" ON library_books;
DROP POLICY IF EXISTS "library_books_entitlement_forall" ON library_books;
CREATE POLICY "library_books_entitlement_forall" ON library_books
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_book_copies_school" ON library_book_copies;
DROP POLICY IF EXISTS "library_book_copies_entitlement_forall" ON library_book_copies;
CREATE POLICY "library_book_copies_entitlement_forall" ON library_book_copies
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_categories_school" ON library_categories;
DROP POLICY IF EXISTS "library_categories_entitlement_forall" ON library_categories;
CREATE POLICY "library_categories_entitlement_forall" ON library_categories
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_shelves_school" ON library_shelves;
DROP POLICY IF EXISTS "library_shelves_entitlement_forall" ON library_shelves;
CREATE POLICY "library_shelves_entitlement_forall" ON library_shelves
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_settings_school" ON library_settings;
DROP POLICY IF EXISTS "library_settings_entitlement_forall" ON library_settings;
CREATE POLICY "library_settings_entitlement_forall" ON library_settings
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_rules_school" ON library_rules;
DROP POLICY IF EXISTS "library_rules_entitlement_forall" ON library_rules;
CREATE POLICY "library_rules_entitlement_forall" ON library_rules
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.catalogue') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_members_school" ON library_members;
DROP POLICY IF EXISTS "library_members_entitlement_forall" ON library_members;
CREATE POLICY "library_members_entitlement_forall" ON library_members
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_loans_school" ON library_loans;
DROP POLICY IF EXISTS "library_loans_entitlement_forall" ON library_loans;
CREATE POLICY "library_loans_entitlement_forall" ON library_loans
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));

DROP POLICY IF EXISTS "library_reservations_school" ON library_reservations;
DROP POLICY IF EXISTS "library_reservations_entitlement_forall" ON library_reservations;
CREATE POLICY "library_reservations_entitlement_forall" ON library_reservations
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])))
  WITH CHECK (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('library.circulation') AND get_my_role() = ANY (ARRAY['admin','bursar','deputy_administrator'])));