import { supabase } from '../../lib/supabase'

export async function fetchDashboardStats() {
  const [
    { count: totalSchools },
    { count: activeSchools },
    { count: trialSchools },
    { count: totalStudents },
    { count: activeStudents },
    { count: totalTeachers },
    { count: totalParents },
    { count: totalProfiles },
    { data: revenueData },
    { data: schoolsByPlan },
    { data: signups },
    { data: revenueByMonth },
    { data: plansData },
  ] = await Promise.all([
    supabase.from('schools').select('*', { count: 'exact', head: true }),
    supabase.from('schools').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('schools').select('*', { count: 'exact', head: true }).eq('status', 'trial'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('teachers').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'parent'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('fee_payments').select('amount'),
    supabase.from('schools').select('plan'),
    supabase.from('schools').select('created_at').order('created_at', { ascending: true }),
    supabase.rpc('get_monthly_revenue'),
    supabase.from('plans').select('key, monthly_price'),
  ])
  const totalRevenue = (revenueData || []).reduce((sum, r) => sum + (r.amount || 0), 0)
  const planCounts = {}
  ;(schoolsByPlan || []).forEach((s) => {
    planCounts[s.plan] = (planCounts[s.plan] || 0) + 1
  })
  const planPrices = {}
  ;(plansData || []).forEach((p) => { planPrices[p.key] = p.monthly_price || 0 })
  const mrr = Object.entries(planCounts).reduce((sum, [plan, count]) => sum + count * (planPrices[plan] || 0), 0)

  const schoolGrowthMap = {}
  ;(signups || []).forEach((s) => {
    if (!s.created_at) return
    const m = new Date(s.created_at).toLocaleDateString('en-KE', { month: 'short', year: '2-digit' })
    schoolGrowthMap[m] = (schoolGrowthMap[m] || 0) + 1
  })
  const schoolGrowth = Object.entries(schoolGrowthMap).map(([month, count]) => ({ month, count }))

  const monthlyRevenue = (revenueByMonth || []).map((r) => ({
    month: r.month,
    amount: r.amount || 0,
  }))

  const now = new Date()
  const sameMonth = (iso, offset) => {
    if (!iso) return false
    const d = new Date(iso)
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth()
  }

  let newSchoolsThisMonth = 0
  let newSchoolsLastMonth = 0
  ;(signups || []).forEach((s) => {
    if (sameMonth(s.created_at, 0)) newSchoolsThisMonth += 1
    else if (sameMonth(s.created_at, -1)) newSchoolsLastMonth += 1
  })

  const schoolGrowthPct = newSchoolsLastMonth > 0
    ? Math.round(((newSchoolsThisMonth - newSchoolsLastMonth) / newSchoolsLastMonth) * 100)
    : null

  const currentMonthKey = now.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' })
  const revenueTrend = (() => {
    if (monthlyRevenue.length < 2) return null
    const last = monthlyRevenue[monthlyRevenue.length - 1]
    if (last.month !== currentMonthKey) return null
    const previous = monthlyRevenue[monthlyRevenue.length - 2].amount || 0
    const current = last.amount || 0
    return {
      current,
      previous,
      pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
    }
  })()

  return {
    totalSchools: totalSchools || 0,
    activeSchools: activeSchools || 0,
    trialSchools: trialSchools || 0,
    totalStudents: totalStudents || 0,
    activeStudents: activeStudents || 0,
    totalTeachers: totalTeachers || 0,
    totalParents: totalParents || 0,
    totalProfiles: totalProfiles || 0,
    totalRevenue,
    mrr,
    arpu: totalSchools > 0 ? Math.round(mrr / totalSchools) : 0,
    planCounts,
    schoolGrowth,
    monthlyRevenue,
    newSchoolsThisMonth,
    newSchoolsLastMonth,
    schoolGrowthPct,
    revenueTrend,
  }
}

export async function fetchSubscriptionBreakdown() {
  const { data } = await supabase.from('schools').select('plan')
  const counts = {}
  ;(data || []).forEach((s) => {
    counts[s.plan] = (counts[s.plan] || 0) + 1
  })
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
}

export async function fetchActiveUserStats() {
  const { data } = await supabase.from('profiles').select('created_at').order('created_at', { ascending: true })
  const map = {}
  ;(data || []).forEach((p) => {
    if (!p.created_at) return
    const m = new Date(p.created_at).toLocaleDateString('en-KE', { month: 'short', year: '2-digit' })
    map[m] = (map[m] || 0) + 1
  })
  return Object.entries(map).map(([month, count]) => ({ month, users: count }))
}
