import { supabase } from '../../lib/supabase'

export async function fetchRevenueSummary() {
  const { data, error } = await supabase.rpc('get_revenue_summary')
  if (error) { console.error('[Payments] summary error:', error); return null }
  return data?.[0] || null
}

export async function fetchRecentPayments(limit = 20) {
  const { data, error } = await supabase.rpc('get_recent_payments', { limit_count: limit })
  if (error) { console.error('[Payments] recent error:', error); return [] }
  return data || []
}

export async function fetchPaymentMethodBreakdown() {
  const { data, error } = await supabase.rpc('get_payment_method_breakdown')
  if (error) { console.error('[Payments] method breakdown error:', error); return [] }
  return data || []
}

export async function fetchMonthlyRevenue() {
  const { data, error } = await supabase.rpc('get_monthly_revenue')
  if (error) { console.error('[Payments] monthly revenue error:', error); return [] }
  return (data || []).map((r) => ({ month: r.month, amount: r.amount || 0 }))
}
