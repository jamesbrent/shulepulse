import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

/**
 * useSchool()
 * -----------
 * Fetches the current school record from Supabase once per mount.
 * Returns: { school, currentTerm, currentYear, loading }
 *
 * All admin pages import this instead of hardcoding 'Term 2' or 2026.
 * Whenever the admin updates Settings → current_term / current_year,
 * every page that mounts fresh will pick up the new value automatically.
 */
export function useSchool() {
  const { profile } = useAuthStore()
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.school_id) return

    const fetch = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profile.school_id)
        .single()
      setSchool(data || null)
      setLoading(false)
    }

    fetch()
  }, [profile?.school_id])

  const currentYear = new Date().getFullYear()

  return {
    school,
    loading,
    // Live values from DB; fall back gracefully while loading
    currentTerm: school?.current_term ?? null,
    currentYear: school?.current_year ?? currentYear,
  }
}
