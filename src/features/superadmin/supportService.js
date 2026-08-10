import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

export async function fetchTickets({ status, priority, category, search, assignedTo, school, dateFrom, dateTo } = {}) {
  let query = supabase
    .from('support_tickets')
    .select('*, schools(name), profiles!created_by(full_name, email), assigned:profiles!assigned_to(full_name, email)')
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (category) query = query.eq('category', category)
  if (assignedTo) {
    if (assignedTo === 'unassigned') {
      query = query.is('assigned_to', null)
    } else if (assignedTo === 'team_support' || assignedTo === 'team_development' || assignedTo === 'team_finance' || assignedTo === 'team_system_admin') {
      query = query.eq('assigned_team', assignedTo.replace('team_', ''))
    } else {
      query = query.eq('assigned_to', assignedTo)
    }
  }
  if (school) query = query.eq('school_id', school)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)
  if (search) query = query.or(`subject.ilike.%${search}%,schools.name.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[Support] fetch error:', error); return [] }
  return data
}

export async function fetchTicketStats() {
  const { data, error } = await supabase.rpc('get_support_stats')
  if (error) {
    const [all, open, inProgress, escalated] = await Promise.all([
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'escalated'),
    ])
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: resolvedToday } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('resolved_at', today.toISOString())

    return {
      open: open.count || 0,
      in_progress: inProgress.count || 0,
      resolved_today: resolvedToday || 0,
      escalated: escalated.count || 0,
      total: all.count || 0,
    }
  }
  return data
}

export async function fetchTicketMessages(ticketId) {
  const { data, error } = await supabase
    .from('ticket_messages')
    .select('*, profiles!sender_id(full_name, email)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  if (error) { console.error('[Support] messages error:', error); return [] }
  return data
}

export async function fetchSupportStaff() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['superadmin', 'admin'])
    .eq('disabled', false)

  if (error) { console.error('[Support] staff error:', error); return [] }
  return data
}

export async function fetchSchools() {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) { console.error('[Support] schools error:', error); return [] }
  return data
}

const CATEGORY_TEAM_MAP = {
  fees_payments: 'finance',
  student_management: 'support',
  exams_cbc: 'support',
  report_cards: 'support',
  login_auth: 'system_admin',
  parent_portal: 'support',
  system_bug: 'development',
  subscription_billing: 'finance',
  api_integration: 'development',
  other: 'unassigned',
}

export async function createTicket({ schoolId, subject, description, priority, category }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      school_id: schoolId,
      subject,
      description,
      priority: priority || 'medium',
      category: category || 'system_bug',
      created_by: user.id,
      assigned_team: CATEGORY_TEAM_MAP[category] || 'unassigned',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await logAction({
    schoolId,
    action: 'support.ticket_created',
    details: { ticketId: ticket.id, subject },
  })

  return ticket
}

export async function fetchSchoolTickets({ status, priority, category, search } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id) return []

  let query = supabase
    .from('support_tickets')
    .select('*, schools(name), profiles!created_by(full_name, email)')
    .eq('school_id', profile.school_id)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (category) query = query.eq('category', category)
  if (search) query = query.ilike('subject', `%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[Support] school tickets error:', error); return [] }
  return data
}

export async function replyToTicket(ticketId, message) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error: msgError } = await supabase
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, sender_id: user.id, message })

  if (msgError) throw new Error(msgError.message)
  return true
}

export async function updateTicket(ticketId, updates) {
  const { error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)

  if (error) throw new Error(error.message)

  await logAction({
    action: 'support.ticket_updated',
    details: { ticketId, ...updates },
  })

  return true
}

export async function deleteTicket(ticketId) {
  const { error } = await supabase
    .from('support_tickets')
    .delete()
    .eq('id', ticketId)

  if (error) throw new Error(error.message)
  return true
}
