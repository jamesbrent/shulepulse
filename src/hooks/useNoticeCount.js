import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useNoticeCount(schoolId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!schoolId) return
    let active = true

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('notices')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
      if (active) setCount(c || 0)
    }

    fetchCount()

    const channel = supabase
      .channel(`notice-count-${schoolId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `school_id=eq.${schoolId}` }, () => fetchCount())
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [schoolId])

  return count
}
