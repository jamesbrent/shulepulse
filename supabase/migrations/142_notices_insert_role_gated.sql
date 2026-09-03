-- ============================================================================
-- 142_notices_insert_role_gated.sql
-- U8: Align notices INSERT RLS with the app's intended NOTICE_CREATE_ROLES.
--
-- Migration 075 created "notices_insert_role_gated" allowing
--   admin, deputy_administrator, teacher, hod, librarian, superadmin
-- to INSERT notices. The frontend UI gates the "create notice" control by
-- NOTICE_CREATE_ROLES (src/utils/roles.js) = admin, hod, deputy_administrator,
-- superadmin, reception, registrar, bursar.
--
-- Mismatch / exposure: the RLS policy lets `teacher` and `librarian` insert
-- even though the UI hides the create button for them (a determined user can
-- still POST directly). Conversely `reception`/`registrar`/`bursar` are
-- allowed by the UI but currently denied by RLS (functional 403).
--
-- Fix: recreate the INSERT policy so its role list EXACTLY mirrors
-- NOTICE_CREATE_ROLES. This removes the over-permission (teacher/librarian)
-- and unblocks the intended writers (reception/registrar/bursar).
-- ============================================================================

DROP POLICY IF EXISTS notices_insert_role_gated ON notices;

CREATE POLICY "notices_insert_role_gated"
  ON notices FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN (
      'admin', 'hod', 'deputy_administrator', 'superadmin',
      'reception', 'registrar', 'bursar'
    ))
    OR get_my_role() = 'superadmin'
  );
