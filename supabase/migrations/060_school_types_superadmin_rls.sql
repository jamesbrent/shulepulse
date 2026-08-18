-- Migration 060: Grant superadmin write access to school_types.

CREATE POLICY "school_types_superadmin_insert"
  ON school_types FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "school_types_superadmin_update"
  ON school_types FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "school_types_superadmin_delete"
  ON school_types FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
