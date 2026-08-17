import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

/**
 * useSchool()
 * -----------
 * Fetches the current school record from Supabase once per mount.
 * Returns: { school, currentTerm, currentYear, loading, refresh }
 *
 * All admin pages import this instead of hardcoding 'Term 2' or 2026.
 * Call refresh() after saving settings to pick up changes immediately.
 */
export function useSchool() {
  const { profile } = useAuthStore()
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchSchool = useCallback(async () => {
    if (!profile?.school_id) return
    setLoading(true)
    const { data } = await supabase
      .from('schools')
      .select('*')
      .eq('id', profile.school_id)
      .single()
    setSchool(data || null)
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => {
    fetchSchool()
  }, [fetchSchool])

  const currentYear = new Date().getFullYear()

  return {
    school,
    loading,
    refresh: fetchSchool,
    currentTerm: school?.current_term ?? null,
    currentYear: school?.current_year ?? currentYear,
  }
}
