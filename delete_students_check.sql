-- Step 1: Find student IDs
-- Run this first to confirm which students you're deleting:
SELECT id, full_name, email, admission_number FROM students
WHERE full_name IN ('Jane Wanjiku Kamau', 'Weni Muli', 'wertyui rr', 'Brent & InspireMeAfrica Foundation', 'YT HH', 'Wnd V');
