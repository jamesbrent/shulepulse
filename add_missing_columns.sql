ALTER TABLE students
ADD COLUMN IF NOT EXISTS nemis_number text,
ADD COLUMN IF NOT EXISTS upi_number text,
ADD COLUMN IF NOT EXISTS birth_cert_number text,
ADD COLUMN IF NOT EXISTS sub_county text,
ADD COLUMN IF NOT EXISTS ward text,
ADD COLUMN IF NOT EXISTS religion text;
