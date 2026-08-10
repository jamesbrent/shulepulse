import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, schools(*)')
        .eq('id', session.user.id)
        .single()

      set({ user: session.user, profile: { ...profile, roles: profile?.roles || (profile?.role ? [profile.role] : []) }, loading: false })
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

        set({ user: session.user, profile: { ...profile, roles: profile?.roles || (profile?.role ? [profile.role] : []) }, loading: false })
      } else {
        set({ user: null, profile: null, loading: false })
      }
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))