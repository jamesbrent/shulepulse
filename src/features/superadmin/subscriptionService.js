import { supabase } from '../../lib/supabase'

let _planPrices = null

async function getPlanPrices() {
  if (_planPrices) return _planPrices
  const { data } = await supabase.from('plans').select('key, monthly_price')
  _planPrices = {}
  ;(data || []).forEach((p) => { _planPrices[p.key] = p.monthly_price || 0 })
  return _planPrices
}

export function getEffectivePrice(school, planPrices) {
  if (school.negotiated_monthly_price) return school.negotiated_monthly_price
  return planPrices[school.plan] || 0
}

export async function getPlanPrice(plan) {
  const prices = await getPlanPrices()
  return prices[plan] || 0
}

export async function getPriceDiff(currentPlan, newPlan) {
  return (await getPlanPrice(newPlan)) - (await getPlanPrice(currentPlan))
}

export async function changeSchoolPlan(schoolId, schoolName, currentPlan, newPlan) {
  const diff = await getPriceDiff(currentPlan, newPlan)

  const { data, error } = await supabase.rpc('set_school_plan', {
    p_school_id: schoolId,
    p_plan_key: newPlan,
    p_options: {},
  })

  if (error) throw new Error(error.message)

  return { success: true, priceDiff: diff, result: data }
}

export async function fetchSubscriptionStats() {
  const [{ data: schools, error }, prices] = await Promise.all([
    supabase.from('schools').select('*, negotiated_monthly_price').order('name'),
    getPlanPrices(),
  ])

  if (error) throw new Error(error.message)

  const planGroups = {}
  let totalMrr = 0
  let totalStandardMrr = 0

  schools.forEach((s) => {
    if (!planGroups[s.plan]) planGroups[s.plan] = []
    planGroups[s.plan].push(s)
    const effective = getEffectivePrice(s, prices)
    totalMrr += effective
    totalStandardMrr += prices[s.plan] || 0
  })

  return { schools, planGroups, totalMrr, totalStandardMrr, planPrices: prices }
}

export async function setNegotiation(schoolId, { monthlyPrice, annualPrice, notes }) {
  const { data, error } = await supabase.rpc('set_school_negotiation', {
    p_school_id: schoolId,
    p_negotiated_monthly_price: monthlyPrice || null,
    p_negotiated_annual_price: annualPrice || null,
    p_notes: notes || null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function clearNegotiation(schoolId) {
  const { data, error } = await supabase.rpc('set_school_negotiation', {
    p_school_id: schoolId,
    p_negotiated_monthly_price: null,
    p_negotiated_annual_price: null,
    p_notes: null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function fetchUpcomingRenewals(daysAhead = 30) {
  const future = new Date()
  future.setDate(future.getDate() + daysAhead)

  const { data, error } = await supabase
    .from('schools')
    .select('*, negotiated_monthly_price')
    .not('subscription_end', 'is', null)
    .lte('subscription_end', future.toISOString())
    .order('subscription_end', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}
