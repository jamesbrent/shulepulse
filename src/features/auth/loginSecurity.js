import { supabase } from '../../lib/supabase'
import { fetchPlatformSettings } from '../superadmin/platformSettingsService'

export async function getClientIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const data = await res.json()
    return data.ip
  } catch {
    return null
  }
}

export async function checkLoginSecurity(email) {
  const settings = await fetchPlatformSettings()
  const auth = settings.auth_security || {}

  const { data: profile } = await supabase
    .from('profiles')
    .select('locked_until, failed_login_attempts')
    .eq('email', email)
    .maybeSingle()

  if (profile?.locked_until) {
    const lockTime = new Date(profile.locked_until)
    if (lockTime > new Date()) {
      const mins = Math.ceil((lockTime - Date.now()) / 60000)
      return { allowed: false, reason: `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` }
    }
  }

  const maxAttempts = auth.max_login_attempts || 5
  if (profile?.failed_login_attempts >= maxAttempts) {
    const lockDuration = auth.account_lock_duration_minutes || 30
    const lockedUntil = new Date(Date.now() + lockDuration * 60000).toISOString()
    await supabase
      .from('profiles')
      .update({ locked_until: lockedUntil })
      .eq('email', email)
    return { allowed: false, reason: `Too many failed attempts. Account locked for ${lockDuration} minutes.` }
  }

  if (auth.ip_restrictions_enabled) {
    const ip = await getClientIp()
    const allowedIps = (auth.ip_restrictions || []).map((i) => i.trim()).filter(Boolean)
    if (allowedIps.length > 0 && ip && !allowedIps.includes(ip)) {
      return { allowed: false, reason: 'Your IP address is not authorized to access this system.' }
    }
  }

  return { allowed: true }
}

export async function recordLoginAttempt({ email, success, ip, userAgent }) {
  await supabase.from('login_attempts').insert({
    email,
    success,
    ip_address: ip,
    user_agent: userAgent,
  })

  if (success) {
    await supabase
      .from('profiles')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('email', email)
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('failed_login_attempts')
      .eq('email', email)
      .maybeSingle()

    await supabase
      .from('profiles')
      .update({ failed_login_attempts: (profile?.failed_login_attempts || 0) + 1 })
      .eq('email', email)
  }
}

export async function recordLoginSession(userId) {
  const settings = await fetchPlatformSettings()
  const auth = settings.auth_security || {}

  if (!auth.device_tracking) return

  const ip = await getClientIp()
  const userAgent = navigator.userAgent

  await supabase.from('login_sessions').insert({
    user_id: userId,
    ip_address: ip,
    user_agent: userAgent,
  })
}
