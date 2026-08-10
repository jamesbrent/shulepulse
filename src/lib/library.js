import { supabase } from './supabase'

export const MEMBER_TYPES = [
  { value: 'student', label: 'Student', color: '#d97706' },
  { value: 'teacher', label: 'Teacher', color: '#2563eb' },
  { value: 'staff', label: 'Staff', color: '#64748b' },
  { value: 'admin', label: 'Admin', color: '#7c3aed' },
  { value: 'librarian', label: 'Librarian', color: '#16a34a' },
]

export const LOAN_STATUS = {
  issued:   { label: 'Issued',   color: '#2563eb', bg: '#dbeafe' },
  returned: { label: 'Returned', color: '#16a34a', bg: '#dcfce7' },
  overdue:  { label: 'Overdue',  color: '#dc2626', bg: '#fee2e2' },
  lost:     { label: 'Lost',     color: '#9333ea', bg: '#f3e8ff' },
  damaged:  { label: 'Damaged',  color: '#ca8a04', bg: '#fef3c7' },
}

export const RESERVATION_STATUS = {
  pending:   { label: 'Pending',   color: '#ca8a04', bg: '#fef3c7' },
  available: { label: 'Available', color: '#16a34a', bg: '#dcfce7' },
  fulfilled: { label: 'Fulfilled', color: '#2563eb', bg: '#dbeafe' },
  cancelled: { label: 'Cancelled', color: '#94a3b8', bg: '#f1f5f9' },
}

export function memberTypeLabel(type) {
  return MEMBER_TYPES.find(t => t.value === type)?.label || type
}

export function daysBetween(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function daysOverdue(loan) {
  if (!loan || loan.returned_at) return 0
  const due = new Date(loan.due_date).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)))
}

export function fmtDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function getSchoolId() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', (await supabase.auth.getUser()).data.user.id)
    .single()
  return profile?.school_id
}

export async function fetchRules(schoolId) {
  const { data } = await supabase.from('library_rules').select('*').eq('school_id', schoolId)
  return data || []
}

export function ruleForType(rules, memberType) {
  return rules.find(r => r.member_type === memberType)
}

export async function currentBorrowedCount(memberId) {
  const { count } = await supabase
    .from('library_loans')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .in('status', ['issued', 'overdue'])
  return count || 0
}
