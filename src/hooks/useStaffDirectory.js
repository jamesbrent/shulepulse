import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const norm = (s) => (s || '').trim().toLowerCase()

export default function useStaffDirectory() {
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id
  const [profiles, setProfiles] = useState([])
  const [teachers, setTeachers] = useState([])
  const [nonTeaching, setNonTeaching] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!schoolId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const [profRes, teachRes, ntsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, phone, role, roles, school_id, disabled, created_at, photo_url, date_of_birth, gender, national_id').eq('school_id', schoolId),
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
  }, [schoolId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const staff = useMemo(() => {
    if (!profiles.length && !teachers.length && !nonTeaching.length) return []

    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
    const profileByEmail = {}
    for (const p of profiles) {
      const e = norm(p.email)
      if (e) profileByEmail[e] = p
    }

    const matchedProfileIds = new Set()
    const all = []

    for (const t of teachers) {
      const rec = buildTeacherRec(t)
      let linkedProfile = null
      if (t.profile_id && profileMap[t.profile_id]) {
        linkedProfile = profileMap[t.profile_id]
        matchedProfileIds.add(linkedProfile.id)
      } else {
        const e = norm(t.email)
        if (e && profileByEmail[e]) {
          linkedProfile = profileByEmail[e]
          matchedProfileIds.add(linkedProfile.id)
        }
      }
      if (linkedProfile) applyProfile(rec, linkedProfile)
      all.push(rec)
    }

    for (const n of nonTeaching) {
      const rec = buildNtsRec(n)
      let linkedProfile = null
      if (n.profile_id && profileMap[n.profile_id]) {
        linkedProfile = profileMap[n.profile_id]
        matchedProfileIds.add(linkedProfile.id)
      } else {
        const e = norm(n.email)
        if (e && profileByEmail[e]) {
          linkedProfile = profileByEmail[e]
          matchedProfileIds.add(linkedProfile.id)
        }
      }
      if (linkedProfile) applyProfile(rec, linkedProfile)
      all.push(rec)
    }

    const ADMIN_ROLES = new Set([
      'admin', 'deputy_administrator', 'bursar', 'registrar', 'reception', 'librarian', 'superadmin',
    ])

    for (const p of profiles) {
      if (matchedProfileIds.has(p.id)) continue
      if (!p.school_id) continue
      const role = p.role || (p.roles && p.roles[0]) || ''
      const isAdminRole = ADMIN_ROLES.has(role)
      all.push({
        sourceType: 'profile',
        sourceIds: { profileId: p.id, teacherId: null, nonTeachingStaffId: null },
        schoolId: p.school_id,
        fullName: p.full_name || '',
        email: p.email || '',
        phone: p.phone || '',
        photoUrl: p.photo_url || null,
        staffCategory: isAdminRole ? 'Administration' : ['teacher', 'class_teacher', 'hod'].includes(role) ? 'Teaching' : 'Non-Teaching',
        position: role ? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Staff',
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
        idNumber: p.national_id || '',
        gender: p.gender || '',
        dateOfBirth: p.date_of_birth || null,
        qualification: '',
        salary: null,
        raw: { profile: p },
      })
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

function buildTeacherRec(t) {
  return {
    sourceType: 'teacher',
    sourceIds: { profileId: t.profile_id || null, teacherId: t.id, nonTeachingStaffId: null },
    schoolId: t.school_id,
    fullName: t.full_name || '',
    email: t.email || '',
    phone: t.phone || '',
    photoUrl: t.photo_url || null,
    staffCategory: 'Teaching',
    position: t.hod_department ? `HOD — ${t.hod_department}` : 'Teacher',
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
}

function buildNtsRec(n) {
  return {
    sourceType: 'non_teaching',
    sourceIds: { profileId: n.profile_id || null, teacherId: null, nonTeachingStaffId: n.id },
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
}

function applyProfile(rec, p) {
  rec.sourceIds.profileId = p.id
  rec.hasLoginAccount = true
  rec.accountStatus = p.disabled ? 'Disabled' : 'Active'
  if (!rec.photoUrl && p.photo_url) rec.photoUrl = p.photo_url
  if (!rec.gender && p.gender) rec.gender = p.gender
  if (!rec.dateOfBirth && p.date_of_birth) rec.dateOfBirth = p.date_of_birth
  if (!rec.idNumber && p.national_id) rec.idNumber = p.national_id
}
