import { supabase } from '../../lib/supabase'

function matchesAppliesTo(structure, student) {
  const appliesTo = structure.fee_categories?.applies_to
  if (!appliesTo || appliesTo === 'all') return true
  if (appliesTo === 'boarding') return student.day_boarding === 'boarding'
  if (appliesTo === 'day') return student.day_boarding === 'day'
  if (appliesTo === 'transport') return !!student.transport_route
  return true
}

export async function setupStudentFees(studentId, schoolId, term, year) {
  if (!studentId || !schoolId || !term || !year) return { created: 0, skipped: 0 }

  const { data: student } = await supabase
    .from('students')
    .select('id, class, day_boarding, transport_route')
    .eq('id', studentId)
    .maybeSingle()
  if (!student?.class) return { created: 0, skipped: 0 }

  const { data: structures } = await supabase
    .from('fee_structures')
    .select('*, fee_categories(name, applies_to)')
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('year', parseInt(year))

  let created = 0
  let skipped = 0
  for (const st of structures || []) {
    if (st.class !== student.class) continue
    if (!matchesAppliesTo(st, student)) continue

    const { data: existing } = await supabase
      .from('fee_assessments')
      .select('id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('fee_structure_id', st.id)
      .eq('term', term)
      .eq('year', parseInt(year))
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { error: aErr } = await supabase.from('fee_assessments').insert({
      school_id:        schoolId,
      student_id:       studentId,
      fee_structure_id: st.id,
      term,
      year:             parseInt(year),
      amount_due:       st.amount,
      status:           'pending',
    })

    if (!aErr) {
      await supabase.from('student_ledger').insert({
        school_id:   schoolId,
        student_id:  studentId,
        entry_type:  'charge',
        amount:      st.amount,
        term,
        year:        parseInt(year),
        description: `${st.fee_categories?.name || 'Fee'} — ${term} ${year}`,
      })
      created++
    }
  }

  return { created, skipped }
}

export async function setupParentAccount(studentId, schoolId) {
  const { data: student } = await supabase
    .from('students')
    .select('id, parent_id, parent_email, parent_name, parent_phone')
    .eq('id', studentId)
    .maybeSingle()
  if (!student || !student.parent_email) return { created: false, error: null }

  const { createParentAuth } = await import('./studentService')
  let password = null
  try {
    const result = await createParentAuth(student.parent_email, student.parent_name || 'Parent', schoolId)
    password = result?.password || null
  } catch (err) {
    console.warn('Parent account creation failed:', err.message)
    return { created: false, error: err.message, password: null }
  }

  const { data: parentProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', student.parent_email)
    .maybeSingle()
  if (parentProfile) {
    await supabase.from('students').update({ parent_id: parentProfile.id }).eq('id', studentId)
  }

  return { created: !!parentProfile, error: null, password }
}
