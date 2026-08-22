import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

let _planPrices = null

async function getPlanPrices() {
  if (_planPrices) return _planPrices
  const { data } = await supabase.from('plans').select('key, monthly_price')
  _planPrices = {}
  ;(data || []).forEach((p) => { _planPrices[p.key] = p.monthly_price || 0 })
  return _planPrices
}

export async function getPlanPrice(plan) {
  const prices = await getPlanPrices()
  return prices[plan] || 0
}

export async function getPriceDiff(currentPlan, newPlan) {
  return (await getPlanPrice(newPlan)) - (await getPlanPrice(currentPlan))
}

export async function changeSchoolPlan(schoolId, schoolName, currentPlan, newPlan) {
  const now = new Date().toISOString()
  const diff = await getPriceDiff(currentPlan, newPlan)

  const { error } = await supabase
    .from('schools')
    .update({
      plan: newPlan,
      subscription_start: now,
      subscription_end: null,
    })
    .eq('id', schoolId)

  if (error) throw new Error(error.message)

  await logAction({
    schoolId,
    action: 'school.plan_changed',
    details: {
      schoolName,
      fromPlan: currentPlan,
      toPlan: newPlan,
      priceDiff: diff,
    },
  })

  return { success: true, priceDiff: diff }
}

export async function fetchSubscriptionStats() {
  const [{ data: schools, error }, prices] = await Promise.all([
    supabase.from('schools').select('*').order('name'),
    getPlanPrices(),
  ])

  if (error) throw new Error(error.message)

  const planGroups = {}
  let totalMrr = 0

  schools.forEach((s) => {
    if (!planGroups[s.plan]) planGroups[s.plan] = []
    planGroups[s.plan].push(s)
    totalMrr += prices[s.plan] || 0
  })

  return { schools, planGroups, totalMrr }
}

export async function fetchUpcomingRenewals(daysAhead = 30) {
  const future = new Date()
  future.setDate(future.getDate() + daysAhead)

  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .not('subscription_end', 'is', null)
    .lte('subscription_end', future.toISOString())
    .order('subscription_end', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}
