import { supabase } from '../../lib/supabase'

export async function fetchSchoolTypes() {
  const { data, error } = await supabase
    .from('school_types')
    .select('*')
    .order('id')
  if (error) throw error
  return data || []
}

export async function addSchoolType(name) {
  const { data, error } = await supabase
    .from('school_types')
    .insert({ name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSchoolType(id, name) {
  const { error } = await supabase
    .from('school_types')
    .update({ name })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSchoolType(id) {
  const { error } = await supabase
    .from('school_types')
    .delete()
    .eq('id', id)
  if (error) throw error
}
