import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'

const DEFAULT_SUMMARY = {
  totalDue:     0,
  totalPaid:    0,
  totalBalance: 0,
  paid:         0,
  partial:      0,
  pending:      0,
}

export function useFeesDashboard(schoolId, term, year) {
  const [summary,        setSummary]  = useState(DEFAULT_SUMMARY)
  const [recentPayments, setRecent]   = useState([])
  const [loading,        setLoading]  = useState(true)

  const load = useCallback(async () => {
    if (!term || !year) return
    setLoading(true)

    // Ledger totals
    const { data: ledger } = await supabase
      .from('student_ledger')
      .select('entry_type, amount')
      .eq('school_id', schoolId)
      .eq('term', term)
      .eq('year', year)

    let totalDue = 0, totalPaid = 0
    ;(ledger || []).forEach((e) => {
      if (['charge', 'penalty'].includes(e.entry_type))                            totalDue  += Number(e.amount)
      if (['payment', 'discount', 'waiver', 'scholarship'].includes(e.entry_type)) totalPaid += Number(e.amount)
    })

    // Recent payments (last 8) with student details
    const { data: payments } = await supabase
      .from('fee_payments')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(8)

    // Fetch staff names for received_by
    const enriched = await enrichWithStaffNames(payments || [])

    // Assessment status counts
    const { data: assessments } = await supabase
      .from('fee_assessments')
      .select('status')
      .eq('school_id', schoolId)
      .eq('term', term)
      .eq('year', year)

    const counts = { paid: 0, partial: 0, pending: 0 }
    ;(assessments || []).forEach((a) => {
      if (counts[a.status] !== undefined) counts[a.status]++
    })

    setSummary({ totalDue, totalPaid, totalBalance: totalDue - totalPaid, ...counts })
    setRecent(enriched)
    setLoading(false)
  }, [schoolId, term, year])

  useEffect(() => { load() }, [load])

  const collectionRate =
    summary.totalDue > 0
      ? Math.round((summary.totalPaid / summary.totalDue) * 100)
      : 0

  return { summary, recentPayments, loading, collectionRate, reload: load }
}

// ─── Fetch staff names for payment received_by fields ───────────────────────
async function enrichWithStaffNames(payments) {
  const staffIds = [...new Set(payments.map((p) => p.received_by).filter(Boolean))]
  if (!staffIds.length) return payments.map((p) => ({ ...p, staff_name: '—' }))

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', staffIds)

  const staffMap = Object.fromEntries((staff || []).map((s) => [s.id, s.full_name]))
  return payments.map((p) => ({ ...p, staff_name: staffMap[p.received_by] || '—' }))
}
