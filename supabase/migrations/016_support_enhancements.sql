ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system_bug'
    CHECK (category IN (
      'fees_payments',
      'student_management',
      'exams_cbc',
      'report_cards',
      'login_auth',
      'parent_portal',
      'system_bug',
      'subscription_billing',
      'api_integration',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_team TEXT DEFAULT 'unassigned'
    CHECK (assigned_team IN ('unassigned', 'support', 'development', 'finance', 'system_admin'));

-- Update existing status check to include 'escalated'
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'escalated'));

CREATE INDEX IF NOT EXISTS idx_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_team ON support_tickets(assigned_team);

-- SLA tracking table
CREATE TABLE IF NOT EXISTS ticket_sla (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  response_target INTERVAL NOT NULL DEFAULT '2 hours',
  resolution_target INTERVAL NOT NULL DEFAULT '24 hours',
  responded_at    TIMESTAMPTZ,
  breach_type     TEXT CHECK (breach_type IN ('response', 'resolution', 'none')) DEFAULT 'none',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_ticket ON ticket_sla(ticket_id);

ALTER TABLE ticket_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_superadmin_all" ON ticket_sla;
CREATE POLICY "sla_superadmin_all" ON ticket_sla
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
