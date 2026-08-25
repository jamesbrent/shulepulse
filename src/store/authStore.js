import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { loadGradingConfig } from '../services/grading/config'
import { logAction } from '../features/audit/auditService'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  selectedSchool: null,
  _disabledChannel: null,

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
          set({ user: null, profile: null, loading: false })
          return
        }

        set({ user: session.user, profile: { ...profile, roles: profile?.roles || (profile?.role ? [profile.role] : []) }, loading: false })
        loadGradingConfig()
      } else {
        set({ user: null, profile: null, loading: false })
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
    set({ user: null, profile: null, selectedSchool: null })
  },
}))
