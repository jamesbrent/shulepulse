import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useBranding } from './useBranding'
import { useAuthStore } from '../../store/authStore'

const POLL_INTERVAL = 15000

export default function BrandingProvider({ children }) {
  const { profile } = useAuthStore()
  const { applyBranding } = useBranding()
  const sigRef = useRef('')

  useEffect(() => {
    if (!profile?.school_id) return

    const loadBranding = async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('name, primary_color, secondary_color, logo_url')
        .eq('id', profile.school_id)
        .single()
      if (data) {
        sigRef.current = `${data.primary_color}|${data.secondary_color}|${data.logo_url || ''}`
        applyBranding({
          primaryColor: data.primary_color || '#2563eb',
          secondaryColor: data.secondary_color || '#16a34a',
          logoUrl: data.logo_url || null,
          schoolName: data.name || '',
        })
      } else if (error) {
        console.error('[BrandingProvider] load error:', error)
      }
    }

    loadBranding()

    const poll = setInterval(async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('primary_color, secondary_color, logo_url, name')
        .eq('id', profile.school_id)
        .single()

      if (error) {
        console.warn('[BrandingProvider] poll error:', error)
        return
      }
      if (!data) return

      const sig = `${data.primary_color}|${data.secondary_color}|${data.logo_url || ''}`
      if (sig !== sigRef.current) {
        sigRef.current = sig
        applyBranding({
          primaryColor: data.primary_color || '#2563eb',
          secondaryColor: data.secondary_color || '#16a34a',
          logoUrl: data.logo_url || null,
          schoolName: data.name || '',
        })
      }
    }, POLL_INTERVAL)

    return () => clearInterval(poll)
  }, [profile, profile?.school_id])

  return children
}
