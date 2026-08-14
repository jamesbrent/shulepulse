-- ════════════════════════════════════════════════════════════════════════
-- 056_RECEPTION_ROLE
-- Adds the 'reception' (Secretary / Front Office) role to the profiles
-- role CHECK constraint and provisions the front-office tables it manages:
--   • visitors              — visitor check-in / check-out register
--   • appointments          — scheduled meetings with staff/office heads
--   • prospective_students  — admissions pipeline (enquiry → admitted)
--   • front_office_requests — request routing desk (fees, academic, ...)
--   • school_events         — school calendar (new/upcoming events)
-- Also grants reception staff the same notice-publishing rights as other
-- staff roles.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Add 'reception' to the profiles role CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN (
  'superadmin',
  'admin',
  'deputy_administrator',
  'bursar',
  'registrar',
  'reception',
  'hod',
  'teacher',
  'class_teacher',
  'librarian',
  'student',
  'parent'
));

-- 2. Allow reception (+ registrar, bursar, deputy_administrator) to publish notices
DROP POLICY IF EXISTS "notices_staff_all" ON notices;
CREATE POLICY "notices_staff_all"
  ON notices FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'teacher', 'hod', 'deputy_admin', 'deputy_administrator',
            'class_teacher', 'registrar', 'reception', 'bursar', 'superadmin')
  );

-- 3. Visitors register
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  id_number TEXT,
  organization TEXT,
  purpose TEXT,
  person_to_see TEXT,
  department TEXT,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'checked_in'
    CHECK (status IN ('checked_in', 'checked_out')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitors_school ON visitors(school_id);

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitors_school_isolation" ON visitors FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 4. Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  visitor_name TEXT NOT NULL,
  phone TEXT,
  organization TEXT,
  person_to_see TEXT NOT NULL,
  department TEXT,
  appointment_date DATE,
  appointment_time TIME,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_school ON appointments(school_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_school_isolation" ON appointments FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 5. Prospective students (admissions pipeline)
CREATE TABLE IF NOT EXISTS prospective_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  class_of_interest TEXT,
  previous_school TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'enquiry'
    CHECK (status IN ('enquiry', 'applied', 'documents_received', 'admitted', 'withdrawn', 'rejected')),
  documents JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospective_students_school ON prospective_students(school_id);

ALTER TABLE prospective_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prospective_students_school_isolation" ON prospective_students FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 6. Front office request routing desk
CREATE TABLE IF NOT EXISTS front_office_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  requester_phone TEXT,
  requester_type TEXT DEFAULT 'visitor'
    CHECK (requester_type IN ('visitor', 'parent', 'student', 'staff', 'other')),
  category TEXT NOT NULL
    CHECK (category IN ('fees', 'academic', 'library', 'discipline', 'admission', 'medical', 'administration', 'general')),
  subject TEXT NOT NULL,
  description TEXT,
  routed_to TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'routed', 'resolved', 'closed')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fr_requests_school ON front_office_requests(school_id);

ALTER TABLE front_office_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "front_office_requests_school_isolation" ON front_office_requests FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 7. School events (calendar)
CREATE TABLE IF NOT EXISTS school_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'general'
    CHECK (event_type IN ('general', 'holiday', 'exam', 'sports', 'meeting', 'ceremony', 'other')),
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  audience TEXT DEFAULT 'all',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_events_school ON school_events(school_id);

ALTER TABLE school_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_events_school_isolation" ON school_events FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
