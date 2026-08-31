import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { loadGradingConfig } from '../services/grading/config'
import { logAction } from '../features/audit/auditService'
import { resolveMfaStatus } from '../features/auth/mfa'

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
  completeMfa: () => set({ mfaChallengeRequired: false }),

  // Apply MFA posture (and the school-provision guard) to a live profile + user.
  // Non-breaking: returns safe defaults when MFA is not configured.
  applySecurityState: async (user, profile) => {
    const status = await resolveMfaStatus(profile).catch(() => ({
      challengeRequired: false,
      setupSuggested: false,
    }))
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
    } else {
      set({ selectedSchool: null })
    }
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, schools(*)')
        .eq('id', session.user.id)
        .single()

      if (profile?.disabled) {
        await supabase.auth.signOut()
        set({ user: null, profile: null, loading: false })
        return
      }

      // School-provision guard: only grant access to users who belong to a school
      // (or are a superadmin). Blocks auto-provisioned/arbitrary accounts (e.g.
      // fresh Google OAuth identities) that have no school_id yet.
      const provisioned = profile?.school_id || profile?.role === 'superadmin'
      if (session.user && profile && !provisioned) {
        await supabase.auth.signOut()
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
          .select('*, schools(*)')
          .eq('id', session.user.id)
          .single()

        if (profile?.disabled) {
          await supabase.auth.signOut()
          set({ user: null, profile: null, loading: false, mfaChallengeRequired: false, mfaSetupSuggested: false })
          return
        }

        const provisioned = profile?.school_id || profile?.role === 'superadmin'
        if (profile && !provisioned) {
          await supabase.auth.signOut()
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
    set({ user: null, profile: null, selectedSchool: null, mfaChallengeRequired: false, mfaSetupSuggested: false })
  },
}))
