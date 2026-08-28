import { supabase } from '../../lib/supabase'

// ─── Shared teacher-account creation (single source of truth) ───────────────
// Reused by TeachersPage and TimetablePage "Add Teacher" so the auth user,
// profile, and teachers row follow ONE proven pattern (was duplicated across
// StaffRoles/StaffDirectory/Timetable/TeachersPage before this refactor).
//
// Flow (same as the reference StaffRoles implementation):
//   1. If the teacher has an email:
//        - link an EXISTING profile when that account already exists, OR
//        - signUp a new auth user with a generated password, then update the
//          profile (full_name, role, roles, school_id).
//   2. INSERT the teachers row (school-scoped, profile_id linked).
// Returns { userId, email, password } so callers can surface credentials.
//
// No email => just the teachers row (existing behaviour, no account created).

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  const arr = new Uint8Array(16)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => chars[b % chars.length]).join('')
}

export async function createTeacher({ schoolId, payload, role = 'teacher' }) {
  const fullName = (payload.full_name || '').trim()
  const email = (payload.email || '').trim().toLowerCase() || null

  let userId = null
  let password = null

  if (email) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing?.id) {
      userId = existing.id
    } else {
      password = generatePassword()
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || null, role } },
      })
      if (signUpError && !/already registered/i.test(signUpError.message)) throw signUpError

      userId = signUpData?.user?.id || null
      if (userId) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ full_name: fullName || null, role, roles: [role], school_id: schoolId })
          .eq('id', userId)
        if (updateError) throw updateError
      }
    }
  }

  const record = { ...payload, school_id: schoolId }
  if (email) record.email = email
  if (userId) record.profile_id = userId

  const { error: insertError } = await supabase.from('teachers').insert(record)
  if (insertError) throw insertError

  return { userId, email, password }
}