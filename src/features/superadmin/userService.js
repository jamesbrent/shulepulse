import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oywptkvlztswblfchvyo.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export async function fetchUsers({ role, search, disabled } = {}) {
  let query = supabase
    .from('profiles')
    .select('*, schools(name)')
    .order('created_at', { ascending: false })

  if (role) query = query.eq('role', role)
  if (disabled !== undefined) query = query.eq('disabled', disabled)
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[Users] fetch error:', error); return [] }
  return data
}

export async function toggleUserDisabled(profileId, fullName, currentDisabled) {
  const newDisabled = !currentDisabled

  const { error } = await supabase
    .from('profiles')
    .update({ disabled: newDisabled })
    .eq('id', profileId)

  if (error) throw new Error(error.message)

  await logAction({
    action: newDisabled ? 'user.locked' : 'user.unlocked',
    details: { userFullName: fullName, userId: profileId },
  })

  return { locked: newDisabled }
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  if (error) throw new Error(error.message)
  return true
}

export async function deleteProfile(profileId, fullName) {
  const { error } = await supabase.from('profiles').delete().eq('id', profileId)
  if (error) throw new Error(error.message)

  await logAction({
    action: 'user.deleted',
    details: { userFullName: fullName, userId: profileId },
  })

  return true
}

export async function setUserPassword(userId, newPassword) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-user-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to reset password')
  return true
}
