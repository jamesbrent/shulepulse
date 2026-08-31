import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'

// Shared server-side balance hook — FINANCE HARDENING ITEM 6.
// Sources of truth are the DB functions student_term_outstanding() and
// student_credit_balance(), so every screen shows the same numbers instead
// of re-deriving its own copy of the formula from raw rows.
export function useStudentBalance(schoolId, studentId, term, year) {
  const [balance, setBalance] = useState(0)
  const [credit,  setCredit]  = useState(0)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!studentId) {
      setBalance(0)
      setCredit(0)
      return
    }
    setLoading(true)
    const [outRes, creditRes] = await Promise.all([
      supabase.rpc('student_term_outstanding', {
        p_school_id: schoolId,
        p_student_id: studentId,
        p_term: term,
        p_year: Number(year),
      }),
      supabase.rpc('student_credit_balance', {
        p_school_id: schoolId,
        p_student_id: studentId,
      }),
    ])
    setBalance(outRes.error ? 0 : Number(outRes.data ?? 0))
    setCredit(creditRes.error ? 0 : Number(creditRes.data ?? 0))
    setLoading(false)
  }, [schoolId, studentId, term, year])

  useEffect(() => { refresh() }, [refresh])

  return { balance, credit, loading, refresh }
}