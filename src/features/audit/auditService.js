import { supabase } from '../../lib/supabase'

let cachedAuditSettings = null
let settingsFetchedAt = 0

async function shouldLog() {
  const now = Date.now()
  if (cachedAuditSettings && now - settingsFetchedAt < 60_000) {
    return cachedAuditSettings
  }
  try {
    const { data } = await supabase.rpc('get_platform_settings_safe')
    const audit = data?.audit_logs || {}
    cachedAuditSettings = {
      user_activity: audit.user_activity !== false,
      system_logs: audit.system_logs !== false,
      error_logs: audit.error_logs !== false,
      login_logs: audit.login_logs !== false,
      payment_logs: audit.payment_logs !== false,
      export_logs: audit.export_logs !== false,
    }
    settingsFetchedAt = now
  } catch {
    cachedAuditSettings = {
      user_activity: true, system_logs: true, error_logs: true,
      login_logs: true, payment_logs: true, export_logs: true,
    }
  }
  return cachedAuditSettings
}

const ACTION_CATEGORY_MAP = {
  'school.onboarded': 'user_activity',
  'school.edited': 'user_activity',
  'school.deleted': 'user_activity',
  'school.suspended': 'user_activity',
  'school.reactivated': 'user_activity',
  'school.announcement': 'user_activity',
  'user.password_reset': 'user_activity',
  'auth.login': 'login_logs',
  'payment.recorded': 'payment_logs',
  'payment.received': 'payment_logs',
  'data.exported': 'export_logs',
}

export async function logAction({ schoolId, action, details = {} }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const settings = await shouldLog()
  const category = ACTION_CATEGORY_MAP[action] || 'user_activity'
  if (settings[category] === false) return

  const { error } = await supabase.from('audit_logs').insert({
    school_id: schoolId || null,
    action,
    details,
    performed_by: user.id,
  })

  if (error) console.error('[Audit] log error:', error)
}

export async function fetchAuditLogs({ action, search, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('audit_logs')
    .select('*, schools!left(name), profiles!left(full_name)')
    .order('performed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) query = query.eq('action', action)
  if (search) query = query.or(`schools.name.ilike.%${search}%,profiles.full_name.ilike.%${search}%`)

  const { data, error } = await query

  if (error) { console.error('[Audit] fetch error:', error); return [] }
  return data
}

export const AUDIT_ACTIONS = [
  'school.onboarded',
  'school.edited',
  'school.deleted',
  'school.suspended',
  'school.reactivated',
]
