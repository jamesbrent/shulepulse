import { supabase } from '../../lib/supabase'

export async function logAction({ schoolId, action, details = {} }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

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

  const { data, error, count } = await query

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
