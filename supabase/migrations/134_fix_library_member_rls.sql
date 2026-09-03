-- ============================================================================
-- 134_fix_library_member_rls.sql
--
-- Problem:
--   Migration 103 (stage_c3_library_rls) replaced permissive school-wide
--   policies with entitlement policies that ONLY allow admin|bursar|deputy_administrator.
--   This blocks:
--     1. librarian role from the /library management console
--     2. teachers/students from /teacher → Library (browse, borrow, reserve)
--        because the ensureMember upsert returns 403 Forbidden.
--
-- Fix:
--   A. Add librarian to the staff role list for all library tables.
--   B. Add member self-service policies:
--      - Any school member can browse the catalogue (SELECT books/copies/categories/shelves/settings/rules)
--      - Any school member can manage their own library_members row (upsert)
--      - Any school member can read their own loans and reservations
--      - Any school member can create/cancel their own reservations
--      - Any school member can renew their own loans
--
-- Safe to re-run (DROP POLICY IF EXISTS on every policy name).
-- ============================================================================

-- ─── A. STAFF POLICIES (management) ───
-- Drop 103's old policies and create staff policies including librarian role.
-- Catalogue tables require 'library.catalogue', circulation tables require 'library.circulation'.

-- library_books (catalogue)
DROP POLICY IF EXISTS "library_library_books_entitlement_forall" ON library_books;
DROP POLICY IF EXISTS "library_library_books_school"            ON library_books;
DROP POLICY IF EXISTS "library_books_staff_all"                 ON library_books;
CREATE POLICY "library_books_staff_all" ON library_books FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_book_copies (catalogue)
DROP POLICY IF EXISTS "library_library_book_copies_entitlement_forall" ON library_book_copies;
DROP POLICY IF EXISTS "library_library_book_copies_school"            ON library_book_copies;
DROP POLICY IF EXISTS "library_book_copies_staff_all"                 ON library_book_copies;
CREATE POLICY "library_book_copies_staff_all" ON library_book_copies FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_categories (catalogue)
DROP POLICY IF EXISTS "library_library_categories_entitlement_forall" ON library_categories;
DROP POLICY IF EXISTS "library_library_categories_school"            ON library_categories;
DROP POLICY IF EXISTS "library_categories_staff_all"                 ON library_categories;
CREATE POLICY "library_categories_staff_all" ON library_categories FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_shelves (catalogue)
DROP POLICY IF EXISTS "library_library_shelves_entitlement_forall" ON library_shelves;
DROP POLICY IF EXISTS "library_library_shelves_school"            ON library_shelves;
DROP POLICY IF EXISTS "library_shelves_staff_all"                 ON library_shelves;
CREATE POLICY "library_shelves_staff_all" ON library_shelves FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_settings (catalogue)
DROP POLICY IF EXISTS "library_library_settings_entitlement_forall" ON library_settings;
DROP POLICY IF EXISTS "library_library_settings_school"            ON library_settings;
DROP POLICY IF EXISTS "library_settings_staff_all"                 ON library_settings;
CREATE POLICY "library_settings_staff_all" ON library_settings FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_rules (catalogue)
DROP POLICY IF EXISTS "library_library_rules_entitlement_forall" ON library_rules;
DROP POLICY IF EXISTS "library_library_rules_school"            ON library_rules;
DROP POLICY IF EXISTS "library_rules_staff_all"                 ON library_rules;
CREATE POLICY "library_rules_staff_all" ON library_rules FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.catalogue')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_members (circulation)
DROP POLICY IF EXISTS "library_library_members_entitlement_forall" ON library_members;
DROP POLICY IF EXISTS "library_library_members_school"            ON library_members;
DROP POLICY IF EXISTS "library_members_staff_all"                 ON library_members;
CREATE POLICY "library_members_staff_all" ON library_members FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_loans (circulation)
DROP POLICY IF EXISTS "library_library_loans_entitlement_forall" ON library_loans;
DROP POLICY IF EXISTS "library_library_loans_school"            ON library_loans;
DROP POLICY IF EXISTS "library_loans_staff_all"                 ON library_loans;
CREATE POLICY "library_loans_staff_all" ON library_loans FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- library_reservations (circulation)
DROP POLICY IF EXISTS "library_library_reservations_entitlement_forall" ON library_reservations;
DROP POLICY IF EXISTS "library_library_reservations_school"            ON library_reservations;
DROP POLICY IF EXISTS "library_reservations_staff_all"                 ON library_reservations;
CREATE POLICY "library_reservations_staff_all" ON library_reservations FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('library.circulation')
      AND get_my_role() IN ('admin','bursar','deputy_administrator','librarian')
    )
  );

-- ─── B. MEMBER SELF-SERVICE POLICIES ───

-- B1. Catalogue browse: any authenticated user can SELECT from catalogue tables
DROP POLICY IF EXISTS "library_books_member_browse"         ON library_books;
CREATE POLICY "library_books_member_browse" ON library_books FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_book_copies_member_browse"  ON library_book_copies;
CREATE POLICY "library_book_copies_member_browse" ON library_book_copies FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_categories_member_browse"   ON library_categories;
CREATE POLICY "library_categories_member_browse" ON library_categories FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_shelves_member_browse"      ON library_shelves;
CREATE POLICY "library_shelves_member_browse" ON library_shelves FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_settings_member_browse"     ON library_settings;
CREATE POLICY "library_settings_member_browse" ON library_settings FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_rules_member_browse"        ON library_rules;
CREATE POLICY "library_rules_member_browse" ON library_rules FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

-- B2. library_members: own row only (profile_id = auth.uid())
DROP POLICY IF EXISTS "library_members_own_select" ON library_members;
CREATE POLICY "library_members_own_select" ON library_members FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "library_members_own_insert" ON library_members;
CREATE POLICY "library_members_own_insert" ON library_members FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() AND school_id = get_my_school_id());

DROP POLICY IF EXISTS "library_members_own_update" ON library_members;
CREATE POLICY "library_members_own_update" ON library_members FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- B3. library_loans: own loans (via member_id)
DROP POLICY IF EXISTS "library_loans_member_select" ON library_loans;
CREATE POLICY "library_loans_member_select" ON library_loans FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "library_loans_member_update" ON library_loans;
CREATE POLICY "library_loans_member_update" ON library_loans FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()));

-- B4. library_reservations: own reservations (via member_id)
DROP POLICY IF EXISTS "library_reservations_member_select" ON library_reservations;
CREATE POLICY "library_reservations_member_select" ON library_reservations FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "library_reservations_member_insert" ON library_reservations;
CREATE POLICY "library_reservations_member_insert" ON library_reservations FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "library_reservations_member_update" ON library_reservations;
CREATE POLICY "library_reservations_member_update" ON library_reservations FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM library_members WHERE profile_id = auth.uid()));
