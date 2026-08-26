import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart']
const CHECK_INTERVAL = 60_000

export default function useSessionTimeout(timeoutMinutes = 60) {
  const lastActivity = useRef(Date.now())
  const signedOut = useRef(false)

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const timeoutMs = timeoutMinutes * 60 * 1000

    function resetTimer() {
      lastActivity.current = Date.now()
    }

    function check() {
      if (signedOut.current) return
      if (Date.now() - lastActivity.current >= timeoutMs) {
        signedOut.current = true
        supabase.auth.signOut().then(() => {
          window.location.href = '/?session_expired=1'
        })
      }
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }))
    const interval = setInterval(check, CHECK_INTERVAL)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer))
      clearInterval(interval)
    }
  }, [timeoutMinutes])
}
