import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function storageKey(userId) {
  return `notice_last_seen_${userId}`
}

export function markNoticesSeen(userId) {
  if (!userId) return
  localStorage.setItem(storageKey(userId), new Date().toISOString())
}

function getLastSeen(userId) {
  if (!userId) return null
  return localStorage.getItem(storageKey(userId))
}

export function useNoticeCount(schoolId, userId) {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!schoolId) return
    const lastSeen = getLastSeen(userId)
    let q = supabase
      .from('notices')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
    if (lastSeen) q = q.gt('created_at', lastSeen)
    const { count: c } = await q
    setCount(c || 0)
  }, [schoolId, userId])

  useEffect(() => {
    if (!schoolId) return
    let active = true

    const run = async () => {
      await fetchCount()
      if (!active) return
    }
    run()

    const channel = supabase
      .channel(`notice-count-${schoolId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `school_id=eq.${schoolId}` }, () => run())
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [schoolId, userId, fetchCount])

  return count
}
