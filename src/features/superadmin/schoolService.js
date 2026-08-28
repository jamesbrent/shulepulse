import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

export async function fetchAllSchools({ search, plan, county, status } = {}) {
  let query = supabase
    .from('schools')
    .select('*, students:students(count), teachers:teachers(count)')
    .order('created_at', { ascending: false })

  if (search) query = query.or(`name.ilike.%${search}%,school_code.ilike.%${search}%`)
  if (plan) query = query.eq('plan', plan)
  if (county) query = query.eq('county', county)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) { console.error('[Schools] fetch error:', error); return [] }
  return data || []
}

export async function fetchSchoolStats(schoolId) {
  const [
    { count: studentCount },
    { count: teacherCount },
    { count: parentCount },
    { count: classCount },
    { count: subjectCount },
    { data: admins },
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'parent'),
    supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('profiles').select('id, email, full_name, role').eq('school_id', schoolId).in('role', ['admin']),
  ])

  return {
    studentCount: studentCount || 0,
    teacherCount: teacherCount || 0,
    parentCount: parentCount || 0,
    classCount: classCount || 0,
    subjectCount: subjectCount || 0,
    admins: admins || [],
  }
}

export async function fetchSchoolRecentActivity(schoolId, limit = 5) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('action, details, performed_at')
    .eq('school_id', schoolId)
    .order('performed_at', { ascending: false })
    .limit(limit)

  if (error) { console.error('[Schools] activity error:', error); return [] }
  return data || []
}

export async function fetchCounties() {
  const { data } = await supabase.from('counties').select('name').order('name')
  return (data || []).map((c) => c.name)
}

export async function deleteSchool(schoolId, schoolName) {
  const { error } = await supabase.rpc('delete_school', { p_school_id: schoolId })
  if (error) throw new Error(error.message)
  return true
}

export async function toggleSchoolStatus(schoolId, schoolName, newStatus) {
  const { error } = await supabase.from('schools').update({ status: newStatus }).eq('id', schoolId)
  if (error) throw new Error(error.message)

  await logAction({
    schoolId,
    action: newStatus === 'suspended' ? 'school.suspended' : 'school.reactivated',
    details: { schoolName },
  })
  return true
}

export async function updateSchoolModules(schoolId, modules) {
  const { error } = await supabase.from('schools').update({ modules_config: modules }).eq('id', schoolId)
  if (error) throw new Error(error.message)
  return true
}

const DEFAULT_MODULES = [
  { key: 'admissions', label: 'Admissions', enabled: true },
  { key: 'students', label: 'Student Management', enabled: true },
  { key: 'fees', label: 'Fees', enabled: true },
  { key: 'cbc', label: 'CBC', enabled: true },
  { key: 'parent_portal', label: 'Parent Portal', enabled: true },
  { key: 'payroll', label: 'Payroll', enabled: true },
  { key: 'library', label: 'Library', enabled: true },
  { key: 'inventory', label: 'Inventory', enabled: true },
  { key: 'hostel', label: 'Hostel', enabled: false },
  { key: 'transport', label: 'Transport', enabled: false },
]

export function getModulesConfig(school) {
  const stored = school.modules_config
  if (stored && Array.isArray(stored) && stored.length > 0) return stored
  return DEFAULT_MODULES
}
