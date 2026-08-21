import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const normalize = (s) => (s || '').trim().toLowerCase()

export default function useStaffDirectory() {
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id
  const [profiles, setProfiles] = useState([])
  const [teachers, setTeachers] = useState([])
  const [nonTeaching, setNonTeaching] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = async () => {
    if (!schoolId) return
    setLoading(true)
    setError(null)
    const [profRes, teachRes, ntsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, phone, role, roles, school_id, disabled, created_at').eq('school_id', schoolId),
      supabase.from('teachers').select('*').eq('school_id', schoolId).order('full_name'),
      supabase.from('non_teaching_staff').select('*').eq('school_id', schoolId).order('full_name'),
    ])
    if (profRes.error || teachRes.error || ntsRes.error) {
      setError(profRes.error?.message || teachRes.error?.message || ntsRes.error?.message)
      setLoading(false)
      return
    }
    setProfiles(profRes.data || [])
    setTeachers(teachRes.data || [])
    setNonTeaching(ntsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [schoolId])

  const staff = useMemo(() => {
    if (!profiles.length && !teachers.length && !nonTeaching.length) return []

    const all = []

    for (const t of teachers) {
      const rec = {
        sourceType: 'teacher',
        sourceIds: { profileId: null, teacherId: t.id, nonTeachingStaffId: null },
        schoolId: t.school_id,
        fullName: t.full_name || '',
        email: t.email || '',
        phone: t.phone || '',
        photoUrl: t.photo_url || null,
        staffCategory: 'Teaching',
        position: 'Teacher',
        department: (t.departments && t.departments[0]) || '',
        employeeNumber: t.employee_number || t.staff_number || t.teacher_code || '',
        employmentType: t.employment_type || '',
        employmentStatus: t.status || (t.active_status ? 'active' : 'inactive'),
        dateOfHire: t.date_of_hire || null,
        hasLoginAccount: false,
        accountStatus: 'No Account',
        subjects: t.subjects || [],
        assignedClasses: t.assigned_classes || [],
        teachingLevel: t.teaching_level || '',
        hodDepartment: t.hod_department || null,
        maximumLessonsPerWeek: t.maximum_lessons_per_week,
        maximumLessonsPerDay: t.maximum_lessons_per_day,
        idNumber: t.id_number || '',
        gender: t.gender || '',
        dateOfBirth: t.date_of_birth || null,
        qualification: t.qualification || '',
        salary: t.salary || null,
        raw: { teacher: t },
      }
      all.push(rec)
    }

    for (const n of nonTeaching) {
      const rec = {
        sourceType: 'non_teaching',
        sourceIds: { profileId: null, teacherId: null, nonTeachingStaffId: n.id },
        schoolId: n.school_id,
        fullName: n.full_name || '',
        email: n.email || '',
        phone: n.phone || '',
        photoUrl: n.photo_url || null,
        staffCategory: 'Non-Teaching',
        position: n.job_title || 'Staff',
        department: n.department || '',
        employeeNumber: n.employee_number || '',
        employmentType: n.employment_type || '',
        employmentStatus: n.status || 'active',
        dateOfHire: n.date_of_hire || null,
        hasLoginAccount: false,
        accountStatus: 'No Account',
        subjects: [],
        assignedClasses: [],
        teachingLevel: '',
        hodDepartment: null,
        maximumLessonsPerWeek: null,
        maximumLessonsPerDay: null,
        idNumber: '',
        gender: n.gender || '',
        dateOfBirth: n.date_of_birth || null,
        qualification: n.qualification || '',
        salary: n.salary || null,
        raw: { nonTeaching: n },
      }
      all.push(rec)
    }

    const profileByEmail = {}
    for (const p of profiles) {
      const email = normalize(p.email)
      if (email) profileByEmail[email] = p
    }

    const matchedTeacherEmails = new Set()
    const matchedNtsEmails = new Set()

    for (const rec of all) {
      const email = normalize(rec.email)
      if (!email) continue
      const p = profileByEmail[email]
      if (!p) continue
      rec.sourceIds.profileId = p.id
      rec.hasLoginAccount = true
      rec.accountStatus = p.disabled ? 'Disabled' : 'Active'
      if (rec.sourceType === 'teacher') matchedTeacherEmails.add(email)
      if (rec.sourceType === 'non_teaching') matchedNtsEmails.add(email)
    }

    const ADMIN_ROLES = new Set([
      'admin', 'deputy_administrator', 'bursar', 'registrar', 'reception', 'librarian', 'superadmin',
    ])

    for (const p of profiles) {
      const email = normalize(p.email)
      if (matchedTeacherEmails.has(email) || matchedNtsEmails.has(email)) continue
      const role = p.role || (p.roles && p.roles[0]) || ''
      const isAdminRole = ADMIN_ROLES.has(role)
      const rec = {
        sourceType: 'profile',
        sourceIds: { profileId: p.id, teacherId: null, nonTeachingStaffId: null },
        schoolId: p.school_id,
        fullName: p.full_name || '',
        email: p.email || '',
        phone: p.phone || '',
        photoUrl: null,
        staffCategory: isAdminRole ? 'Administration' : (role === 'teacher' || role === 'class_teacher' || role === 'hod') ? 'Teaching' : 'Non-Teaching',
        position: role ? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Staff',
        department: '',
        employeeNumber: '',
        employmentType: '',
        employmentStatus: p.disabled ? 'Disabled' : 'Active',
        dateOfHire: null,
        hasLoginAccount: true,
        accountStatus: p.disabled ? 'Disabled' : 'Active',
        subjects: [],
        assignedClasses: [],
        teachingLevel: '',
        hodDepartment: null,
        maximumLessonsPerWeek: null,
        maximumLessonsPerDay: null,
        idNumber: '',
        gender: '',
        dateOfBirth: null,
        qualification: '',
        salary: null,
        raw: { profile: p },
      }
      all.push(rec)
    }

    all.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
    return all
  }, [profiles, teachers, nonTeaching])

  const stats = useMemo(() => {
    const total = staff.length
    const teaching = staff.filter((s) => s.staffCategory === 'Teaching').length
    const nonTeachingCount = staff.filter((s) => s.staffCategory === 'Non-Teaching').length
    const admin = staff.filter((s) => s.staffCategory === 'Administration').length
    const withLogin = staff.filter((s) => s.hasLoginAccount).length
    const withoutLogin = staff.filter((s) => !s.hasLoginAccount).length
    return { total, teaching, nonTeaching: nonTeachingCount, admin, withLogin, withoutLogin }
  }, [staff])

  return { staff, stats, loading, error, refetch: fetchAll }
}
