-- ─────────────────────────────────────────────────────────────────────────────
-- Support center: tickets + messages
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  created_by    UUID NOT NULL REFERENCES profiles(id),
  assigned_to   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_school   ON support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
DROP POLICY IF EXISTS "tickets_superadmin_all" ON support_tickets;
CREATE POLICY "tickets_superadmin_all" ON support_tickets
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- School: read own, create, update own
DROP POLICY IF EXISTS "tickets_school_select" ON support_tickets;
CREATE POLICY "tickets_school_select" ON support_tickets
  FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "tickets_school_insert" ON support_tickets;
CREATE POLICY "tickets_school_insert" ON support_tickets
  FOR INSERT
  WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- 2. ticket_messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
DROP POLICY IF EXISTS "messages_superadmin_all" ON ticket_messages;
CREATE POLICY "messages_superadmin_all" ON ticket_messages
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- School: read own ticket messages, insert own
DROP POLICY IF EXISTS "messages_school_select" ON ticket_messages;
CREATE POLICY "messages_school_select" ON ticket_messages
  FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets
      WHERE school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_school_insert" ON ticket_messages;
CREATE POLICY "messages_school_insert" ON ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND ticket_id IN (
      SELECT id FROM support_tickets
      WHERE school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );

-- 3. Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_updated ON support_tickets;
CREATE TRIGGER trg_ticket_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();
