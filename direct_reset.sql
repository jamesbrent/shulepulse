-- Try direct update without a function
UPDATE auth.users 
SET encrypted_password = crypt('Student@123', gen_salt('bf')),
    updated_at = now()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au
  WHERE au.raw_user_meta_data ->> 'role' = 'student'
     OR au.email LIKE 'adm-%'
     OR au.email LIKE '%@student.%'
);
