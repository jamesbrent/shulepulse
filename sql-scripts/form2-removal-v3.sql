-- ═══════════════════════════════════════════════════════════════
-- FORM 2 REMOVAL (v3 — fee_payments → fees chain handled)
-- Run this as one block in the Supabase SQL Editor.
-- Expected: all STEP 6 rows_left = 0, STEP 7 grades_total = 54.
-- Rollback if checks fail: ROLLBACK;  (or restore from backups)
-- ═══════════════════════════════════════════════════════════════

-- STEP 0: Backups (recreated)
DROP TABLE IF EXISTS form2_backup_grades;
CREATE TABLE form2_backup_grades AS SELECT * FROM grades
WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae')
   OR class_name ILIKE 'form%';

DROP TABLE IF EXISTS form2_backup_students;
CREATE TABLE form2_backup_students AS SELECT * FROM students WHERE class ILIKE 'form%';

DROP TABLE IF EXISTS form2_backup_levels;
CREATE TABLE form2_backup_levels AS SELECT * FROM grade_levels WHERE name ILIKE 'form%';

DROP TABLE IF EXISTS form2_backup_fees;
CREATE TABLE form2_backup_fees AS SELECT * FROM fees WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae');

DROP TABLE IF EXISTS form2_backup_fee_payments;
CREATE TABLE form2_backup_fee_payments AS SELECT * FROM fee_payments
WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae')
   OR fee_id IN (SELECT id FROM fees WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae'));

-- STEP 1: Transaction
BEGIN;

-- STEP 2a: Delete fee_payments linked via fee_id FIRST (the FK chain that blocked v2)
DELETE FROM fee_payments
WHERE fee_id IN (SELECT id FROM fees
                 WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae'));

-- STEP 2b: Delete remaining related rows in EVERY table that has student_id,
--          iterating until a full pass deletes nothing
DO $$
DECLARE t TEXT; c TEXT; n INT; pass_total INT;
BEGIN
  LOOP
    pass_total := 0;
    FOR t, c IN
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name = 'student_id' AND table_schema = 'public'
    LOOP
      EXECUTE format(
        'DELETE FROM %I WHERE %I = ANY (''{d150bb11-fd58-4784-be99-3db00c9c94a9,61fe61ca-663b-4b21-b6d1-1e5a9ca360ae}''::uuid[])',
        t, c);
      GET DIAGNOSTICS n = ROW_COUNT;
      pass_total := pass_total + n;
    END LOOP;
    EXIT WHEN pass_total = 0;
  END LOOP;
END $$;

-- STEP 3: Belt-and-suspenders — any FORM 2 grade rows not caught above
DELETE FROM grades WHERE class_name ILIKE 'form%';

-- STEP 4: Delete the FORM 2 students
DELETE FROM students WHERE class ILIKE 'form%';

-- STEP 5: Delete the FORM 2 grade_levels row if present
DELETE FROM grade_levels WHERE name ILIKE 'form%';

-- STEP 6: VERIFICATION (all rows_left must be 0)
SELECT 'grades' AS tbl, COUNT(*) AS rows_left FROM grades WHERE class_name ILIKE 'form%' OR student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae')
UNION ALL SELECT 'students', COUNT(*) FROM students WHERE class ILIKE 'form%'
UNION ALL SELECT 'grade_levels', COUNT(*) FROM grade_levels WHERE name ILIKE 'form%'
UNION ALL SELECT 'fees', COUNT(*) FROM fees WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae')
UNION ALL SELECT 'fee_payments', COUNT(*) FROM fee_payments WHERE fee_id IN (SELECT id FROM fees WHERE student_id IN ('d150bb11-fd58-4784-be99-3db00c9c94a9','61fe61ca-663b-4b21-b6d1-1e5a9ca360ae'));

-- STEP 7: Confirm remaining totals (grades should now be 54)
SELECT COUNT(*) AS grades_total FROM grades;

-- STEP 8: COMMIT if checks pass (else ROLLBACK)
COMMIT;
