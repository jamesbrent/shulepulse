import { supabase } from '../../lib/supabase'

const STAFF_ROLES = ['admin', 'deputy_administrator', 'bursar', 'registrar', 'reception', 'hod', 'teacher', 'class_teacher', 'librarian']

function buildSnapshot(counts) {
  const school = counts.school || null
  const classes = counts.classes ?? 0
  const subjects = counts.subjects ?? 0
  const teachers = counts.teachers ?? 0
  const nonTeaching = counts.nonTeaching ?? 0
  const students = counts.students ?? 0
  const feeCategories = counts.feeCategories ?? 0
  const feeStructures = counts.feeStructures ?? 0
  const gradeLevels = counts.gradeLevels ?? 0
  const timetable = counts.timetable ?? 0
  const staffProfiles = counts.staffProfiles ?? 0
  const parents = counts.parents ?? 0

  return {
    counts: {
      school,
      classes,
      subjects,
      teachers,
      nonTeaching,
      students,
      feeCategories,
      feeStructures,
      gradeLevels,
      timetable,
      staffProfiles,
      parents,
    },
    checks: {
      schoolProfile: !!(school?.name && school?.type && school?.county),
      currentTerm: !!(school?.current_term && school?.current_year),
      classesReady: classes > 0,
      streamsReady: classes > 0,
      subjectsReady: subjects > 0,
      gradingReady: gradeLevels > 0,
      staffReady: (teachers + nonTeaching) > 0,
      staffUsersReady: staffProfiles > 1,
      studentsReady: students > 0,
      parentsReady: parents > 0,
      feesReady: feeCategories > 0 && feeStructures > 0,
      timetableReady: timetable > 0,
    },
  }
}

export async function fetchSetupSnapshot({ schoolId, profile }) {
  if (!schoolId) return { steps: [], overallPct: 0, loading: false, error: 'No school linked to your account.' }

  try {
    const { data, error } = await supabase.rpc('get_setup_snapshot', { p_school_id: schoolId })
    if (!error && data?.counts) {
      return { ...buildSnapshot({ school: data.school, ...data.counts }), raw: data }
    }
  } catch {
    /* fall through to per-table queries */
  }

  const reqs = {
    school: supabase.from('schools').select('name, county, type, phone, email, logo_url, current_term, current_year, plan, subscription_status').eq('id', schoolId).maybeSingle(),
    classes: supabase.from('classes').select('id, class_name, stream', { count: 'exact', head: true }).eq('school_id', schoolId),
    subjects: supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    teachers: supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    nonTeaching: supabase.from('non_teaching_staff').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    students: supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    feeCategories: supabase.from('fee_categories').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    feeStructures: supabase.from('fee_structures').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    gradeLevels: supabase.from('grade_levels').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    timetable: supabase.from('timetable_slots').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    staffProfiles: supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .in('role', STAFF_ROLES),
  }

  if (profile?.id) {
    reqs.parentProfiles = supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'parent')
  }

  const results = await Promise.all(Object.entries(reqs).map(async ([key, q]) => {
    try {
      const { data, error, count } = await q
      if (error) return [key, { error }]
      if (key === 'school') return [key, { data }]
      return [key, { count: count ?? 0 }]
    } catch (err) {
      return [key, { error: err }]
    }
  }))

  const out = Object.fromEntries(results)
  const school = out.school?.data || null

  return {
    ...buildSnapshot({
      school,
      classes: out.classes?.count ?? 0,
      subjects: out.subjects?.count ?? 0,
      teachers: out.teachers?.count ?? 0,
      nonTeaching: out.nonTeaching?.count ?? 0,
      students: out.students?.count ?? 0,
      feeCategories: out.feeCategories?.count ?? 0,
      feeStructures: out.feeStructures?.count ?? 0,
      gradeLevels: out.gradeLevels?.count ?? 0,
      timetable: out.timetable?.count ?? 0,
      staffProfiles: out.staffProfiles?.count ?? 0,
      parents: out.parentProfiles?.count ?? 0,
    }),
    raw: out,
  }
}

export function buildSetupSteps(snapshot, { financeEnabled }) {
  const c = snapshot?.checks || {}
  const counts = snapshot?.counts || {}

  const steps = []

  steps.push({
    key: 'school_info',
    title: 'School Information',
    nav: 'settings_page',
    module: 'General Settings',
    required: true,
    auto: false,
    done: !!c.schoolProfile,
    hint: 'Confirm your school name, category and county.',
    detail: counts.school ? `${counts.school.name} · ${counts.school.type || '—'}` : 'Not configured',
    why: 'Foundational details used in reports, receipts and branding.',
    action: 'Open Settings',
  })

  steps.push({
    key: 'academic_year',
    title: 'Academic Year & Terms',
    nav: 'settings_page',
    module: 'General Settings',
    required: true,
    auto: false,
    done: !!c.currentTerm,
    hint: 'Set the current term and year so attendance, grades and fees use the right period.',
    detail: counts.school?.current_term ? `Term: ${counts.school.current_term} · Year: ${counts.school.current_year || '—'}` : 'Not set',
    why: 'Drives the operating period for every module.',
    action: 'Open Settings',
  })

  steps.push({
    key: 'classes',
    title: 'Classes & Streams',
    nav: 'students',
    module: 'Student Records',
    required: true,
    auto: false,
    done: !!c.classesReady,
    hint: 'Create your classes (and streams where applicable) before adding students.',
    detail: `${counts.classes || 0} class(es)`,
    why: 'Students must be assigned to a class; attendance, assessments and reports depend on it.',
    action: 'Open Students',
  })

  steps.push({
    key: 'subjects',
    title: 'Subjects',
    nav: 'timetable',
    module: 'Timetable',
    required: true,
    auto: true,
    done: !!c.subjectsReady,
    hint: 'Your CBC subjects were added automatically. Review and adjust the list if needed.',
    detail: `${counts.subjects || 0} subject(s) configured`,
    why: 'Subjects are needed for teacher assignment, marking and the timetable.',
    action: 'Open Timetable',
  })

  steps.push({
    key: 'grading',
    title: 'Grading Configuration',
    nav: 'settings_page',
    module: 'General Settings',
    required: false,
    auto: true,
    done: !!c.gradingReady,
    hint: 'Default grading systems and bands were created automatically.',
    detail: `${counts.gradeLevels || 0} grade level(s)`,
    why: 'Grades and report cards use these bands.',
    action: 'Open Settings',
  })

  steps.push({
    key: 'staff',
    title: 'Staff & Teachers',
    nav: 'teachers',
    module: 'Teachers',
    required: true,
    auto: false,
    done: !!c.staffReady,
    hint: 'Add teachers and non-teaching staff, then assign them to classes and subjects.',
    detail: `${(counts.teachers || 0) + (counts.nonTeaching || 0)} staff member(s)`,
    why: 'Staff are required for teaching, marking, attendance and school operations.',
    action: 'Open Teachers',
  })

  steps.push({
    key: 'students',
    title: 'Students',
    nav: 'students',
    module: 'Student Records',
    required: true,
    auto: false,
    done: !!c.studentsReady,
    hint: 'Add or import your learners. You can bulk-import from Excel/CSV.',
    detail: `${counts.students || 0} student(s)`,
    why: 'The school cannot use attendance, assessments or reports without learners.',
    action: 'Open Students',
  })

  steps.push({
    key: 'parents',
    title: 'Parents & Guardians',
    nav: 'students',
    module: 'Student Records',
    required: false,
    auto: false,
    done: !!c.parentsReady,
    hint: 'Link guardians to learners so they can access the parent portal.',
    detail: `${counts.parents || 0} parent account(s)`,
    why: 'Enables parent messaging and the parent portal.',
    action: 'Open Students',
  })

  if (financeEnabled) {
    steps.push({
      key: 'fees',
      title: 'Fees & Finance',
      nav: 'fees',
      module: 'Fee Management',
      required: true,
      auto: false,
      done: !!c.feesReady,
      hint: 'Configure fee categories and fee structures before collecting payments.',
      detail: `${counts.feeCategories || 0} category(ies) · ${counts.feeStructures || 0} structure(s)`,
      why: 'Finance is enabled for your school, so fee setup is required to operate.',
      action: 'Open Fees',
    })
  }

  steps.push({
    key: 'users',
    title: 'Users & Roles',
    nav: 'staffroles',
    module: 'Staff Roles',
    required: true,
    auto: false,
    done: !!c.staffUsersReady,
    hint: 'Add staff accounts (e.g. teachers, bursar) so the right people can log in with appropriate permissions.',
    detail: `${Math.max(0, (counts.staffProfiles || 1) - 1)} additional staff user(s)`,
    why: 'Beyond your admin account, each person needs a role-appropriate login.',
    action: 'Open Staff Roles',
  })

  steps.push({
    key: 'timetable',
    title: 'Timetable',
    nav: 'timetable',
    module: 'Timetable',
    required: false,
    auto: false,
    done: !!c.timetableReady,
    hint: 'Generate a timetable so periods and lesson attendance are available.',
    detail: `${counts.timetable || 0} weekly slot(s)`,
    why: 'Needed for lesson planning and lesson-level attendance.',
    action: 'Open Timetable',
  })

  const required = steps.filter((s) => s.required)
  const doneCount = steps.filter((s) => s.done).length
  const overallPct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  const ready = required.every((s) => s.done)

  return { steps, overallPct, ready }
}

const SETUP_PREF_KEY = (userId) => `shulepulse_setup_choice_${userId}`

export function getSetupChoice(userId) {
  try {
    return localStorage.getItem(SETUP_PREF_KEY(userId)) || null
  } catch {
    return null
  }
}

export async function fetchSetupPreference(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('setup_choice, welcome_seen_at, setup_completed_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  } catch (err) {
    console.warn('Could not load setup preference', err)
    return null
  }
}

export async function setSetupChoice(userId, value) {
  try {
    localStorage.setItem(SETUP_PREF_KEY(userId), value)
  } catch {
    /* ignore */
  }
  if (!userId) return
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        setup_choice: value,
        welcome_seen_at: new Date().toISOString(),
      })
      .eq('id', userId)
    if (error) throw error
  } catch (err) {
    console.warn('Could not save setup preference', err)
  }
}

export async function markSetupCompleted(userId) {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ setup_completed_at: new Date().toISOString() })
      .eq('id', userId)
      .is('setup_completed_at', null)
    if (error) throw error
  } catch (err) {
    console.warn('Could not record setup completion', err)
  }
}