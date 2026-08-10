-- Run this in SQL Editor to create a password reset function
CREATE OR REPLACE FUNCTION reset_all_student_passwords(new_password text DEFAULT 'Student@123')
RETURNS TABLE(email text, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  u RECORD;
  uid uuid;
BEGIN
  FOR u IN
    SELECT au.id, au.email
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
    WHERE p.role = 'student'
  LOOP
    uid := u.id;
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = uid;
    email := u.email;
    success := true;
    message := 'Password reset';
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Then run this to actually reset all student passwords:
-- SELECT * FROM reset_all_student_passwords('Student@123');
