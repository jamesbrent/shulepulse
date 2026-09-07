import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { loadGradingConfig, refreshGradingConfig } from '../services/grading/config'
import { logAction } from '../features/audit/auditService'
import { resolveMfaStatus, isMfaDoneFor, markMfaDone, clearMfaDone } from '../features/auth/mfa'

// Supabase builders are thenables (await/.then) but have no .catch(), so a
// bare `.catch()` on rpc() would throw. Fail open on any RPC error so an
// unavailable gate never blocks a legitimate parent at login.
async function hasPortalAccess(uid) {
  try {
    const { error } = await supabase.rpc('has_portal_access', { p_user_id: uid })
    return !error
  } catch {
    return true
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  selectedSchool: null,
  mfaChallengeRequired: false,
  mfaSetupSuggested: false,
  _disabledChannel: null,

  // Completes the MFA gate after the user passes a TOTP challenge. Also called
  // by routes that hold a persistent session and gate on mfaChallengeRequired.
  completeMfa: async () => {
    let uid = get().user?.id
    if (!uid) {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
      uid = data?.session?.user?.id
    }
    markMfaDone(uid)
    set({ mfaChallengeRequired: false })
  },

  // Apply MFA posture (and the school-provision guard) to a live profile + user.
  // Non-breaking: returns safe defaults when MFA is not configured.
  applySecurityState: async (user, profile) => {
    const status = await resolveMfaStatus(profile).catch(() => ({
      challengeRequired: false,
      setupSuggested: false,
    }))
    // Once the user passed a TOTP challenge this session, a reload must not
    // demand a second challenge.
    if (user && isMfaDoneFor(user.id)) {
      status.challengeRequired = false
    }
    set({
      mfaChallengeRequired: status.challengeRequired || false,
      mfaSetupSuggested: status.setupSuggested || false,
    })
    return status
  },

  selectSchool: async (school) => {
    const { profile } = get()
    if (school && profile) {
      const { error } = await supabase.rpc('switch_school', {
        p_user_id: profile.id,
        p_school_id: school.id,
      })
      if (error) {
        console.error('[AuthStore] switch_school failed:', error)
        return
      }
      set({ selectedSchool: school, profile: { ...profile, school_id: school.id, schools: school } })
      logAction({ schoolId: school.id, action: 'school_switch', details: { user_id: profile.id, to_school: school.id } })
      refreshGradingConfig(school.id)
    } else {
      set({ selectedSchool: null })
    }
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, schools!school_id(*)')
        .eq('id', session.user.id)
        .single()

      if (profile?.disabled) {
        await supabase.auth.signOut()
        set({ user: null, profile: null, loading: false })
        return
      }

      // School-provision guard: only grant access to users who belong to a school
      // (or are a superadmin). Blocks auto-provisioned/arbitrary accounts (e.g.
      // fresh Google OAuth identities) that have no school_id yet. Parents are
      // additionally gated on active Portal Access for at least one child.
      const provisioned = profile?.school_id || profile?.role === 'superadmin'
      const parentAllowed = profile?.role !== 'parent'
        || await hasPortalAccess(session.user.id)
      if (session.user && profile && (!provisioned || !parentAllowed)) {
        await supabase.auth.signOut()
        clearMfaDone()
        set({ user: null, profile: null, loading: false, mfaChallengeRequired: false, mfaSetupSuggested: false })
        return
      }

      await get().applySecurityState(session.user, profile)
      set({ user: session.user, profile: { ...profile, roles: profile?.roles || (profile?.role ? [profile.role] : []) }, loading: false })
      loadGradingConfig()
    } else {
      set({ user: null, profile: null, loading: false })
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*, schools!school_id(*)')
          .eq('id', session.user.id)
          .single()

        if (profile?.disabled) {
          await supabase.auth.signOut()
          set({ user: null, profile: null, loading: false, mfaChallengeRequired: false, mfaSetupSuggested: false })
          return
        }

        const provisioned = profile?.school_id || profile?.role === 'superadmin'
        const parentAllowed = profile?.role !== 'parent'
          || await hasPortalAccess(session.user.id)
        if (profile && (!provisioned || !parentAllowed)) {
          await supabase.auth.signOut()
          clearMfaDone()
          set({ user: null, profile: null, loading: false, mfaChallengeRequired: false, mfaSetupSuggested: false })
          return
        }

        await get().applySecurityState(session.user, profile)
        set({ user: session.user, profile: { ...profile, roles: profile?.roles || (profile?.role ? [profile.role] : []) }, loading: false })
        loadGradingConfig()
      } else {
        set({ user: null, profile: null, loading: false, mfaChallengeRequired: false, mfaSetupSuggested: false })
      }
    })

    // Real-time: kick disabled users immediately (VULN-55)
    const prevChannel = get()._disabledChannel
    if (prevChannel) {
      supabase.removeChannel(prevChannel)
    }

    const currentUser = get().user
    if (currentUser) {
      const channel = supabase
        .channel('profile-disabled-watch')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${currentUser.id}`,
        }, async (payload) => {
          if (payload.new?.disabled) {
            console.warn('[AuthStore] Account disabled — signing out')
            await supabase.auth.signOut()
            set({ user: null, profile: null, selectedSchool: null })
          }
        })
        .subscribe()
      set({ _disabledChannel: channel })
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[AuthStore] signOut error:', err)
    }
    clearMfaDone()
    set({ user: null, profile: null, selectedSchool: null, mfaChallengeRequired: false, mfaSetupSuggested: false })
  },
}))
