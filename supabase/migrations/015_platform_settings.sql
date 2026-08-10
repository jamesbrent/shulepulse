CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  general JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscription JSONB NOT NULL DEFAULT '{}'::jsonb,
  modules JSONB NOT NULL DEFAULT '{}'::jsonb,
  auth_security JSONB NOT NULL DEFAULT '{}'::jsonb,
  sms JSONB NOT NULL DEFAULT '{}'::jsonb,
  email JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_gateways JSONB NOT NULL DEFAULT '{}'::jsonb,
  academic_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_backups JSONB NOT NULL DEFAULT '{}'::jsonb,
  audit_logs JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
  maintenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  legal JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_settings_single_row CHECK (id = 1)
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only superadmins can read platform_settings"
  ON platform_settings FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "Only superadmins can insert platform_settings"
  ON platform_settings FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "Only superadmins can update platform_settings"
  ON platform_settings FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- Seed default row
INSERT INTO platform_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
