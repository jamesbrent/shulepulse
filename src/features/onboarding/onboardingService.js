import { supabase } from '../../lib/supabase'
import { logAction } from '../audit/auditService'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function onboardSchool({ school, admin, acceptedLegal }) {
  if (!EMAIL_RE.test(admin.email)) {
    throw new Error('Please enter a valid email address for the admin.')
  }

  const now = new Date()
  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + 14)

  const { data: newSchool, error: schoolError } = await supabase
    .from('schools')
    .insert({
      name: school.name,
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

  if (schoolError) {
    console.error('[onboardSchool] insert error:', schoolError)
    throw new Error(schoolError.message)
  }

  // Seed CBC subjects (safety net — trigger trg_seed_cbc_subjects also handles this)
  await supabase.rpc('seed_cbc_subjects', { p_school_id: newSchool.id })

  const { data: existingProfile, error: profileQueryError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', admin.email)
    .maybeSingle()

  if (profileQueryError) {
    await supabase.from('schools').delete().eq('id', newSchool.id)
    throw new Error(`Failed to find admin: ${profileQueryError.message}`)
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ school_id: newSchool.id, role: 'admin', full_name: admin.fullName })
    .eq('id', existingProfile.id)

  if (updateError) {
    await supabase.from('schools').delete().eq('id', newSchool.id)
    throw new Error(`Failed to link admin: ${updateError.message}`)
  }

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
    await supabase.from('schools').delete().eq('id', newSchool.id)
    throw new Error(`Admin signup failed: ${signUpError.message}`)
  }

  await logAction({
    schoolId: newSchool.id,
    action: 'school.onboarded',
    details: { schoolName: newSchool.name, plan: school.plan, adminEmail: admin.email },
  })

  await supabase.auth.signOut()

  return true
}
