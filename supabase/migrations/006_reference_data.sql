-- ─────────────────────────────────────────────────────────────────────────────
-- Reference data for onboarding (replace hardcoded values)
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. counties — Kenyan counties
CREATE TABLE IF NOT EXISTS counties (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

INSERT INTO counties (name) VALUES
  ('Mombasa'), ('Kwale'), ('Kilifi'), ('Tana River'), ('Lamu'),
  ('Taita-Taveta'), ('Garissa'), ('Wajir'), ('Mandera'), ('Marsabit'),
  ('Isiolo'), ('Meru'), ('Tharaka-Nithi'), ('Embu'), ('Kitui'),
  ('Machakos'), ('Makueni'), ('Nyandarua'), ('Nyeri'), ('Kirinyaga'),
  ('Murang''a'), ('Kiambu'), ('Turkana'), ('West Pokot'), ('Samburu'),
  ('Trans-Nzoia'), ('Uasin Gishu'), ('Elgeyo-Marakwet'), ('Nandi'),
  ('Baringo'), ('Laikipia'), ('Nakuru'), ('Narok'), ('Kajiado'),
  ('Kericho'), ('Bomet'), ('Kakamega'), ('Vihiga'), ('Bungoma'),
  ('Busia'), ('Siaya'), ('Kisumu'), ('Homa Bay'), ('Migori'),
  ('Kisii'), ('Nyamira'), ('Nairobi')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE counties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counties_read_all" ON counties FOR SELECT USING (true);

-- 2. school_types
CREATE TABLE IF NOT EXISTS school_types (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

INSERT INTO school_types (name) VALUES
  ('Pre-Primary Education (PP1–PP2)'),
  ('Primary Education (Grades 1–6)'),
  ('Junior Secondary School / JSS (Grades 7–9)'),
  ('Senior Secondary School / SSS (Grades 10–12)'),
  ('Mixed (Primary + Secondary)')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE school_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_types_read_all" ON school_types FOR SELECT USING (true);

-- 3. plans — subscription plans
CREATE TABLE IF NOT EXISTS plans (
  id            SERIAL PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  price_label   TEXT NOT NULL,
  features      JSONB NOT NULL DEFAULT '[]',
  color         TEXT NOT NULL DEFAULT '#475569',
  bg            TEXT NOT NULL DEFAULT '#f1f5f9',
  recommended   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO plans (key, label, price_label, features, color, bg, recommended, sort_order, monthly_price, annual_price) VALUES
  ('basic',      'Basic',      'KES 10,000',  '["Up to 200 students","Basic reports","Email support"]',                                                             '#475569', '#f1f5f9', false, 1, 10000, 100000),
  ('pro',        'Pro',        'KES 15,000',  '["Up to 1,000 students","Advanced analytics","Priority support","Parent portal"]',                                    '#2563eb', '#dbeafe', true,  2, 15000, 150000),
  ('enterprise', 'Enterprise', 'KES 20,000',  '["Unlimited students","Custom branding","Dedicated support","All features","API access"]',                            '#ca8a04', '#fef9c3', false, 3, 20000, 200000)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read_all" ON plans FOR SELECT USING (true);
