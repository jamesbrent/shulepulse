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

export const COPY_STATUS = {
  available: { label: 'Available', color: '#16a34a', bg: '#dcfce7' },
  borrowed:  { label: 'Borrowed',  color: '#2563eb', bg: '#dbeafe' },
  lost:      { label: 'Lost',      color: '#9333ea', bg: '#f3e8ff' },
  damaged:   { label: 'Damaged',   color: '#ca8a04', bg: '#fef3c7' },
  withdrawn: { label: 'Withdrawn', color: '#64748b', bg: '#f1f5f9' },
}

export async function getLibrarySettings(schoolId) {
  let data
  const { data: row } = await supabase
    .from('library_settings')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle()
  data = row
  if (!data) {
    try {
      const { data: created } = await supabase
        .from('library_settings')
        .insert({ school_id: schoolId })
        .select()
        .single()
      data = created
    } catch (e) {
      // Ignore — a concurrent insert may have won the race.
    }
    if (!data) {
      const { data: refetched } = await supabase
        .from('library_settings').select('*').eq('school_id', schoolId).maybeSingle()
      data = refetched
    }
  }
  return data
}

export async function generateCopyCodes(schoolId, count) {
  if (!count || count <= 0) return []
  const settings = await getLibrarySettings(schoolId)
  const prefix = settings?.code_prefix || 'LIB'
  const { data } = await supabase.rpc('next_book_copy_codes', {
    p_prefix: prefix,
    p_count: count,
  })
  return data || []
}

const ROLE_TO_MEMBER_TYPE = {
  student: 'student',
  teacher: 'teacher',
  class_teacher: 'teacher',
  hod: 'admin',
  admin: 'admin',
  deputy_administrator: 'admin',
  bursar: 'admin',
  registrar: 'admin',
  librarian: 'librarian',
}

export function memberTypeForRole(role) {
  return ROLE_TO_MEMBER_TYPE[role] || null
}

export async function memberCodeForUser(schoolId, email, role) {
  if (role === 'student') {
    const { data: s } = await supabase
      .from('students')
      .select('admission_number')
      .eq('school_id', schoolId).eq('email', email)
      .maybeSingle()
    return s?.admission_number ? `STD/${s.admission_number}` : null
  }
  if (role === 'teacher' || role === 'class_teacher') {
    let t = null
    try {
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('school_id', schoolId).eq('email', email)
        .maybeSingle()
      t = data
    } catch (e) {
      t = null
    }
    const code = t?.staff_number || t?.teacher_code || t?.employee_number
    return code ? `TCH/${code}` : null
  }
  return null
}

export async function syncLibraryMembers(schoolId) {
  if (!schoolId) return

  let teachersRes
  try {
    teachersRes = await supabase
      .from('teachers')
      .select('*')
      .eq('school_id', schoolId)
  } catch (e) {
    teachersRes = { data: [] }
  }

  const [profilesRes, studentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('school_id', schoolId)
      .neq('role', 'parent'),
    supabase
      .from('students')
      .select('email, admission_number')
      .eq('school_id', schoolId).eq('status', 'active'),
  ])

  const students = new Map((studentsRes.data || []).map(s => [s.email, s]))
  const teachers = new Map((teachersRes?.data || []).map(t => [t.email, t]))

  const { data: existingMembers } = await supabase
    .from('library_members')
    .select('profile_id, member_code')
    .eq('school_id', schoolId)
  const existing = existingMembers || []
  const profileRows = new Map(existing.filter(m => m.profile_id).map(m => [m.profile_id, m]))
  const takenCodes = new Set(existing.map(m => m.member_code).filter(Boolean))
  const batchCodes = new Set()

  const rows = (profilesRes.data || []).map(p => {
    const type = memberTypeForRole(p.role)
    if (!type) return null
    let code = null
    if (type === 'student' && students.has(p.email)) code = `STD/${students.get(p.email).admission_number}`
    if (type === 'teacher' && teachers.has(p.email)) {
      const t = teachers.get(p.email)
      code = `TCH/${t.staff_number || t.teacher_code || t.employee_number}`
    }
    // The code must be unique per school (UNIQUE school_id, member_code) and
    // unique within this batch too — otherwise the upsert 409s.
    if (code) {
      const holder = profileRows.get(p.id)
      if (takenCodes.has(code) && holder?.member_code !== code) code = null
      if (code && batchCodes.has(code)) code = null
      if (code) batchCodes.add(code)
    }
    return {
      school_id: schoolId,
      profile_id: p.id,
      member_type: type,
      full_name: p.full_name,
      email: p.email,
      member_code: code,
    }
  }).filter(Boolean)

  if (rows.length) {
    const { error } = await supabase
      .from('library_members')
      .upsert(rows, { onConflict: 'school_id,profile_id' })
    if (error && error.code === '23505') {
      // Rare concurrent race — retry once.
      await supabase
        .from('library_members')
        .upsert(rows, { onConflict: 'school_id,profile_id' })
    }
  }
}
