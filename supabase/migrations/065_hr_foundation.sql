-- Migration 065: HR Foundation
-- Adds profile_id FKs to teachers and non_teaching_staff (nullable, safe for existing data)
-- Adds HR identity fields to profiles
-- Backfills existing teacher→profile links by email

-- ═══ 1. HR columns on profiles ═══
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- ═══ 2. profile_id FK on teachers (nullable) ═══
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teachers' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE teachers ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    CREATE INDEX idx_teachers_profile ON teachers(profile_id);
  END IF;
END $$;

-- ═══ 3. profile_id FK on non_teaching_staff (nullable) ═══
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'non_teaching_staff' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE non_teaching_staff ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    CREATE INDEX idx_nts_profile ON non_teaching_staff(profile_id);
  END IF;
END $$;

-- ═══ 4. Backfill: link teachers to profiles by exact email match ═══
UPDATE teachers t
SET profile_id = p.id
FROM profiles p
WHERE t.profile_id IS NULL
  AND t.email IS NOT NULL
  AND t.email = p.email
  AND t.school_id = p.school_id;

-- ═══ 5. Backfill: link non_teaching_staff to profiles by exact email match ═══
UPDATE non_teaching_staff n
SET profile_id = p.id
FROM profiles p
WHERE n.profile_id IS NULL
  AND n.email IS NOT NULL
  AND n.email = p.email
  AND n.school_id = p.school_id;
