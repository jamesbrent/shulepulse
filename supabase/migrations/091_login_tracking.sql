-- Migration 091: Login attempt tracking, device tracking, account lock duration

-- Track failed login attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, created_at DESC);

-- Track successful login sessions (device tracking)
CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_out_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions (user_id, logged_in_at DESC);

-- Add lock timestamp and failed attempt count to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

-- RLS: users can only see their own login sessions
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions"
  ON login_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System inserts login sessions"
  ON login_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System updates login sessions"
  ON login_sessions FOR UPDATE
  USING (true);

-- RLS for login_attempts (superadmin can read for audit)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read login attempts"
  ON login_attempts FOR SELECT
  USING (get_my_role() = 'superadmin');

CREATE POLICY "System inserts login attempts"
  ON login_attempts FOR INSERT
  WITH CHECK (true);
