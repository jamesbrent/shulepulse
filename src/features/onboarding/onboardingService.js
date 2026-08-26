import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'
import { fetchPlatformSettings } from '../superadmin/platformSettingsService'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForProfile(email, retries = 10, delayMs = 400) {
  for (let i = 0; i < retries; i++) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (data) return data
    await sleep(delayMs)
  }
  return null
}

export async function onboardSchool({ school, admin, acceptedLegal }) {
  if (!EMAIL_RE.test(admin.email)) {
    throw new Error('Please enter a valid email address for the admin.')
  }

  if (!school.name?.trim()) {
    throw new Error('School name is required.')
  }

  const { data: dup } = await supabase
    .from('schools')
    .select('id')
    .ilike('name', school.name.trim())
    .maybeSingle()

  if (dup) {
    throw new Error(`A school named "${school.name.trim()}" already exists.`)
  }

  const now = new Date()
  let trialDays = 14
  try {
    const settings = await fetchPlatformSettings()
    trialDays = settings.subscription?.trial_duration_days || 14
  } catch { /* use default */ }

  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + trialDays)

  let newSchool
  try {
    const { data, error } = await supabase
      .from('schools')
      .insert({
        name: school.name.trim(),
        county: school.county,
        type: school.type,
        address: school.address,
        phone: school.phone,
        email: school.email,
        plan: school.plan,
        primary_color: school.primaryColor,
        secondary_color: school.secondaryColor,
        status: 'active',
        subscription_start: now.toISOString(),
        subscription_end: trialEnd.toISOString(),
        subscription_status: 'trial',
        accepted_terms_at: acceptedLegal ? now.toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error
    newSchool = data
  } catch (err) {
    console.error('[onboardSchool] insert error:', err)
    throw new Error(err.message)
  }

  const cleanup = async () => {
    await supabase.from('schools').delete().eq('id', newSchool.id)
  }

  await supabase.rpc('seed_cbc_subjects', { p_school_id: newSchool.id })

  let adminCreated = false
  let lastErrorMsg = null

  // 1. Primary: Direct PostgreSQL RPC (Instant, pre-confirmed, zero rate limits)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_school_admin_user', {
      p_email: admin.email,
      p_password: admin.password,
      p_full_name: admin.fullName,
      p_school_id: newSchool.id,
    })

    if (!rpcError && rpcData?.success) {
      adminCreated = true
    } else if (rpcError) {
      lastErrorMsg = rpcError.message
    }
  } catch (err) {
    lastErrorMsg = err.message
  }

  // 2. Secondary: Edge Function (create-admin-auth)
  if (!adminCreated) {
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-admin-auth', {
        body: {
          email: admin.email,
          password: admin.password,
          full_name: admin.fullName,
          school_id: newSchool.id,
          role: 'admin',
        },
      })

      if (!edgeError && edgeData?.success) {
        adminCreated = true
      } else {
        lastErrorMsg = edgeError?.message || edgeData?.error || lastErrorMsg
      }
    } catch (err) {
      lastErrorMsg = err.message
    }
  }

  // 3. Tertiary Fallback: Client-side signUp
  if (!adminCreated) {
    console.warn('[onboardSchool] Falling back to client signUp:', lastErrorMsg)

    const { error: signUpError } = await supabase.auth.signUp({
      email: admin.email,
      password: admin.password,
      options: {
        data: {
          role: 'admin',
          school_id: newSchool.id,
          full_name: admin.fullName,
        },
      },
    })

    if (signUpError && !signUpError.message?.includes('already')) {
      await cleanup()
      throw new Error(`Admin signup failed: ${signUpError.message}`)
    }

    const profile = await waitForProfile(admin.email)

    if (!profile) {
      await cleanup()
      throw new Error(
        'Could not create admin profile. Please run migration 094 in the Supabase SQL Editor.'
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ school_id: newSchool.id, role: 'admin', full_name: admin.fullName })
      .eq('id', profile.id)

    if (updateError) {
      await cleanup()
      throw new Error(`Failed to link admin to school: ${updateError.message}`)
    }
  }

  await logAction({
    schoolId: newSchool.id,
    action: 'school.onboarded',
    details: { schoolName: newSchool.name, plan: school.plan, adminEmail: admin.email },
  })

  await supabase.auth.signOut()

  return true
}
