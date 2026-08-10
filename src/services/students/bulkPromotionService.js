import { supabase } from '../../lib/supabase'

export async function getGradeLevels(schoolId) {
  const { data, error } = await supabase
    .from('grade_levels')
    .select('*')
    .eq('school_id', schoolId)
    .order('promotion_order')

  if (error) throw error
  return data || []
}

export function getNextClass(currentClass, gradeLevels) {
  const current = gradeLevels.find((g) => g.name === currentClass)
  if (!current || current.is_final) return null
  const next = gradeLevels.find((g) => g.promotion_order === current.promotion_order + 1)
  return next?.name || null
}

export function getPromotableClasses(gradeLevels) {
  return gradeLevels.filter((g) => !g.is_final).map((g) => g.name)
}

export async function previewPromotion(schoolId, fromClass) {
  const levels = await getGradeLevels(schoolId)
  const nextClass = getNextClass(fromClass, levels)
  if (!nextClass) return { students: [], nextClass: null }

  const { data, error } = await supabase
    .from('students')
    .select('id, admission_number, full_name, class, stream, gender, status')
    .eq('school_id', schoolId)
    .eq('class', fromClass)
    .eq('status', 'active')
    .order('full_name')

  if (error) throw error
  return { students: data || [], nextClass }
}

export async function executePromotion(schoolId, fromClass, studentIds, userId) {
  const levels = await getGradeLevels(schoolId)
  const nextClass = getNextClass(fromClass, levels)
  if (!nextClass) throw new Error('No promotion target for ' + fromClass)

  const now = new Date().toISOString()

  const { data: promoted, error } = await supabase
    .from('students')
    .update({
      class: nextClass,
      updated_at: now,
      updated_by: userId,
    })
    .eq('school_id', schoolId)
    .eq('class', fromClass)
    .in('id', studentIds)
    .select('id, admission_number, full_name, class')

  if (error) throw error

  await supabase.from('promotion_history').insert(
    (promoted || []).map((s) => ({
      school_id: schoolId,
      student_id: s.id,
      from_class: fromClass,
      to_class: nextClass,
      promoted_by: userId,
      promoted_at: now,
    }))
  )

  return { promoted: promoted || [], nextClass }
}

export async function promoteStudentsAtomic(schoolId, studentIds, userId) {
  const { data, error } = await supabase.rpc('promote_students', {
    p_school_id: schoolId,
    p_student_ids: studentIds,
    p_promoted_by: userId,
  })

  if (error) throw error
  return data
}

export async function getPromotionHistory(schoolId, limit = 50) {
  const { data, error } = await supabase
    .from('promotion_history')
    .select('*, students(full_name, admission_number)')
    .eq('school_id', schoolId)
    .order('promoted_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}
