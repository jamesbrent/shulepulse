import { supabase } from '../../lib/supabase'

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  let pw = ''
  const arr = new Uint8Array(16)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < 16; i++) pw += chars[arr[i] % chars.length]
  return pw
}

const STUDENT_FIELDS = `
  id, school_id, admission_number, full_name, photo_url,
  date_of_birth, gender, class, stream,
  religion, nationality, previous_school,
  blood_group, allergies, medical_conditions, special_needs,
  day_boarding, status,
  date_admitted, created_at, updated_at, updated_by,
  parent_name, parent_phone, parent_email, parent_id
`

export async function fetchStudents(schoolId, filters = {}) {
  let query = supabase
    .from('students')
    .select(STUDENT_FIELDS, { count: 'exact' })
    .eq('school_id', schoolId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.class) query = query.eq('class', filters.class)
  if (filters.stream) query = query.eq('stream', filters.stream)
  if (filters.gender) query = query.eq('gender', filters.gender)
  if (filters.day_boarding) query = query.eq('day_boarding', filters.day_boarding)
  if (filters.search) {
    const s = `%${filters.search}%`
    query = query.or(
      `full_name.ilike.${s},admission_number.ilike.${s},parent_name.ilike.${s}`
    )
  }

  query = query.order('created_at', { ascending: false })

  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count }
}

export async function getStudentById(id) {
  const { data, error } = await supabase
    .from('students')
    .select(STUDENT_FIELDS)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createStudent(payload) {
  const { data, error } = await supabase
    .from('students')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStudent(id, payload) {
  const { data, error } = await supabase
    .from('students')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteStudent(id, userId) {
  const { error } = await supabase
    .from('students')
    .update({ status: 'inactive', updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function bulkSoftDelete(ids, userId) {
  const { error } = await supabase
    .from('students')
    .update({ status: 'inactive', updated_by: userId, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
}

export async function fetchStudentStats(schoolId) {
  const { data, error } = await supabase
    .from('students')
    .select('gender, class, stream, status, day_boarding')
    .eq('school_id', schoolId)
  if (error) throw error

  const total = data.length
  const active = data.filter(s => s.status === 'active').length
  const inactive = data.filter(s => s.status === 'inactive').length
  const alumni = data.filter(s => s.status === 'alumni').length
  const transferred = data.filter(s => s.status === 'transferred').length
  const boys = data.filter(s => s.gender === 'male').length
  const girls = data.filter(s => s.gender === 'female').length
  const boarders = data.filter(s => s.day_boarding === 'boarding').length
  const dayScholars = data.filter(s => s.day_boarding === 'day').length

  const classDist = {}
  const streamDist = {}
  for (const s of data) {
    if (s.class) classDist[s.class] = (classDist[s.class] || 0) + 1
    if (s.stream) streamDist[s.stream] = (streamDist[s.stream] || 0) + 1
  }

  return {
    total, active, inactive, alumni, transferred,
    boys, girls, boarders, dayScholars,
    classDist, streamDist,
  }
}

export async function fetchClasses(schoolId) {
  const { data, error } = await supabase
    .from('students')
    .select('class')
    .eq('school_id', schoolId)
    .not('class', 'is', null)
    .order('class')
  if (error) throw error
  return [...new Set(data.map(r => r.class).filter(Boolean))].sort()
}

export async function fetchStreams(schoolId) {
  const { data, error } = await supabase
    .from('students')
    .select('stream')
    .eq('school_id', schoolId)
    .not('stream', 'is', null)
    .order('stream')
  if (error) throw error
  return [...new Set(data.map(r => r.stream).filter(Boolean))].sort()
}

export async function generateAdmissionNumber(schoolId, year = new Date().getFullYear()) {
  // Read-only preview of the next admission number (matches what the DB
  // trigger will assign on insert). The trigger owns the real allocation so
  // concurrent adds never collide (was: in-memory counts of students created
  // this year → wrong sequence and global-unique collisions).
  const { data, error } = await supabase.rpc('preview_student_admission_number', {
    p_school_id: schoolId,
    p_year: year,
  })
  if (error) throw error
  return data
}

export async function createStudentAuth(student, schoolId) {
  const email = student.email
  if (!email) throw new Error('Student has no email address')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const password = generateSecurePassword()

  const { data, error } = await supabase.functions.invoke('create-student-auth', {
    body: {
      email,
      full_name: student.full_name,
      school_id: schoolId,
      password,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return { userId: data?.user_id, email, password }
}

export async function resetStudentPassword(userId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const password = generateSecurePassword()
  const { data, error } = await supabase.functions.invoke('create-student-auth', {
    body: { user_id: userId, password },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return { password }
}

export async function bulkCreateStudentAuth(schoolId) {
  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select('id, full_name, email')
    .eq('school_id', schoolId)
    .not('email', 'is', null)
    .neq('email', '')
  if (fetchErr) throw fetchErr

  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('email, id')
    .eq('role', 'student')

  const profileByEmail = {}
  for (const p of (existingProfiles || [])) {
    if (p.email) profileByEmail[p.email] = p.id
  }

  let created = 0
  let skipped = 0
  const errors = []

  for (const student of students) {
    if (!student.email) { skipped++; continue }
    try {
      const existingUserId = profileByEmail[student.email]
      if (!existingUserId) {
        await createStudentAuth(student, schoolId)
        created++
      } else {
        skipped++
      }
    } catch (err) {
      errors.push({ student: student.full_name, error: err.message })
      skipped++
    }
  }

  return { created, skipped, errors }
}

export async function createParentAuth(parentEmail, parentName, schoolId) {
  const password = generateSecurePassword()

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: parentEmail,
    password,
    options: {
      data: { full_name: parentName, role: 'parent' },
      emailRedirectTo: window.location.origin,
    },
  })

  if (signUpError && !signUpError.message?.includes('already registered')) throw signUpError

  const userId = data?.user?.id

  if (userId) {
    await supabase.from('profiles').update({
      school_id: schoolId,
      full_name: parentName,
      role: 'parent',
      roles: ['parent'],
    }).eq('id', userId)
  } else {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', parentEmail).single()
    if (existing) return { userId: existing.id, email: parentEmail, password }
  }

  return { userId, email: parentEmail, password }
}

export async function bulkCreateParentAccounts(schoolId) {
  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select('id, full_name, parent_name, parent_email, parent_id')
    .eq('school_id', schoolId)
    .not('parent_email', 'is', null)
    .neq('parent_email', '')
  if (fetchErr) throw fetchErr

  const parentByEmail = {}
  for (const s of (students || [])) {
    if (s.parent_email) {
      if (!parentByEmail[s.parent_email]) {
        parentByEmail[s.parent_email] = {
          name: s.parent_name || s.parent_email.split('@')[0],
          studentIds: [],
        }
      }
      parentByEmail[s.parent_email].studentIds.push(s.id)
    }
  }

  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('email, id')
    .eq('role', 'parent')

  const profileByEmail = {}
  for (const p of (existingProfiles || [])) {
    if (p.email) profileByEmail[p.email] = p.id
  }

  let created = 0
  let skipped = 0
  let linked = 0
  const errors = []
  const credentials = []

  for (const [email, info] of Object.entries(parentByEmail)) {
    try {
      let userId = profileByEmail[email]

      if (!userId) {
        const result = await createParentAuth(email, info.name, schoolId)
        userId = result.userId
        created++
        credentials.push({ email, name: info.name, password: result.password })
      }

      if (userId) {
        const { error: linkErr } = await supabase
          .from('students')
          .update({ parent_id: userId })
          .in('id', info.studentIds)
          .is('parent_id', null)
        if (!linkErr) linked += info.studentIds.length
      }
    } catch (err) {
      errors.push({ email, error: err.message })
      skipped++
    }
  }

  return { created, skipped, linked, errors, credentials, totalParents: Object.keys(parentByEmail).length }
}
