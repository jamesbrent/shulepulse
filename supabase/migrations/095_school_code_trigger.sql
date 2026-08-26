-- Migration 095: Auto-generate school_code on INSERT

CREATE OR REPLACE FUNCTION generate_school_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.school_code IS NULL OR NEW.school_code = '' THEN
    NEW.school_code := 'SHP' || LPAD(CAST(floor(random() * 100000)::int AS text), 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_school_code ON schools;
CREATE TRIGGER trg_generate_school_code
  BEFORE INSERT ON schools
  FOR EACH ROW
  EXECUTE FUNCTION generate_school_code();
