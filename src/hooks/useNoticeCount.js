import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function storageKey(userId) {
  return `notice_last_seen_${userId}`
}

async function resolveSchoolId(userId, schoolId) {
  if (schoolId) return schoolId
  if (!userId) return null
  try {
    const { data } = await supabase.from('profiles').select('school_id').eq('id', userId).maybeSingle()
    return data?.school_id || null
  } catch {
    return null
  }
}

export async function markNoticesSeen(userId, schoolId) {
  if (!userId) return
  const sid = await resolveSchoolId(userId, schoolId)
  if (!sid) {
    localStorage.setItem(storageKey(userId), new Date().toISOString())
    return
  }
  try {
    const { data: notices } = await supabase
      .from('notices')
      .select('id')
      .eq('school_id', sid)
    const ids = (notices || []).map((n) => n.id)
    if (!ids.length) return

    const { data: read } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', userId)
    const readSet = new Set((read || []).map((r) => r.notice_id))
    const toInsert = ids
      .filter((id) => !readSet.has(id))
      .map((id) => ({ school_id: sid, notice_id: id, user_id: userId }))
    if (toInsert.length) {
      await supabase.from('notice_reads').insert(toInsert)
    }
  } catch (e) {
    localStorage.setItem(storageKey(userId), new Date().toISOString())
  }
}

export function useNoticeCount(schoolId, userId) {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!schoolId) return
    if (userId) {
      try {
        const [{ data: notices }, { data: read }] = await Promise.all([
          supabase.from('notices').select('id').eq('school_id', schoolId),
          supabase.from('notice_reads').select('notice_id').eq('user_id', userId),
        ])
        const readSet = new Set((read || []).map((r) => r.notice_id))
        const unread = (notices || []).filter((n) => !readSet.has(n.id)).length
        setCount(unread)
        return
      } catch (e) {
        // fall through to localStorage-based count
      }
    }
    const lastSeen = localStorage.getItem(storageKey(userId))
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

    let readChannel = null
    if (userId) {
      readChannel = supabase
        .channel(`notice-reads-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notice_reads', filter: `user_id=eq.${userId}` }, () => run())
        .subscribe()
    }

    return () => {
      active = false
      supabase.removeChannel(channel)
      if (readChannel) supabase.removeChannel(readChannel)
    }
  }, [schoolId, userId, fetchCount])

  return count
}
