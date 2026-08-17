import { supabase } from '../../lib/supabase'

export async function fetchCounties() {
  const { data } = await supabase.from('counties').select('name').order('name')
  return (data || []).map((c) => c.name)
}

export async function fetchSchoolTypes() {
  return [
    { value: 'pre-primary', label: 'Pre-Primary Education (PP1–PP2)' },
    { value: 'primary', label: 'Primary Education (Grades 1–6)' },
    { value: 'junior-secondary', label: 'Junior Secondary School / JSS (Grades 7–9)' },
    { value: 'senior-secondary', label: 'Senior Secondary School / SSS (Grades 10–12)' },
    { value: 'mixed', label: 'Mixed (Primary + Secondary)' },
  ]
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
