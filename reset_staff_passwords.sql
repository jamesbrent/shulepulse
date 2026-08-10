-- Run this in the Supabase SQL Editor to reset all staff/admin passwords
-- Creates a function, then run it with the password of your choice.
CREATE OR REPLACE FUNCTION reset_all_staff_passwords(new_password text DEFAULT 'Staff@123')
RETURNS TABLE(email text, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  u RECORD;
  uid uuid;
BEGIN
  FOR u IN
    SELECT au.id, au.email, p.role
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
    WHERE p.role <> 'student'
  LOOP
    uid := u.id;
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = uid;
    email := u.email;
    success := true;
    message := 'Password reset to ' || new_password;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Then run this to actually reset all staff/admin passwords:
-- SELECT * FROM reset_all_staff_passwords('Staff@123');
