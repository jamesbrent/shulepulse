import { supabase } from '../../lib/supabase'

export async function fetchCounties() {
  const { data } = await supabase.from('counties').select('name').order('name')
  return (data || []).map((c) => c.name)
}

export async function fetchSchoolTypes() {
  const { data } = await supabase.from('school_types').select('name').order('id')
  return (data || []).map((t) => t.name)
}

export async function fetchPlans() {
  const { data } = await supabase.from('plans').select('*').order('sort_order')
  return (data || []).map((p) => ({
    key: p.key,
    label: p.label,
    price: p.price_label,
    features: p.features || [],
    color: p.color,
    bg: p.bg,
    recommended: p.recommended,
  }))
}
