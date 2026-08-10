-- 1. Check all distinct roles in profiles
SELECT DISTINCT role, COUNT(*) as count FROM profiles GROUP BY role;

-- 2. Show first few teacher profiles
SELECT id, email, full_name, role, school_id FROM profiles WHERE role = 'teacher' LIMIT 5;

-- 3. Show ALL profiles to see what roles exist
SELECT id, email, full_name, role, school_id FROM profiles LIMIT 20;
