import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

const PLAN_PRICES = { basic: 2500, pro: 5000, enterprise: 10000 }

export function getPlanPrice(plan) {
  return PLAN_PRICES[plan] || 0
}

export function getPriceDiff(currentPlan, newPlan) {
  return getPlanPrice(newPlan) - getPlanPrice(currentPlan)
}

export async function changeSchoolPlan(schoolId, schoolName, currentPlan, newPlan) {
  const now = new Date().toISOString()
  const diff = getPriceDiff(currentPlan, newPlan)

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
  const { data: schools, error } = await supabase
    .from('schools')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)

  const planGroups = { basic: [], pro: [], enterprise: [] }
  let totalMrr = 0

  schools.forEach((s) => {
    if (planGroups[s.plan]) planGroups[s.plan].push(s)
    totalMrr += getPlanPrice(s.plan)
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
