import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      token:         null,
      refreshToken:  null,
      user:          null,
      business:      null,
      profile:       null,
      subscription:  null,
      isSuperAdmin:  false,

      setAuth: (token, user, refreshToken) =>
        set({ token, user, refreshToken }),

      setBusiness: (business) =>
        set({ business }),

      setProfile: (profile) =>
        set({ profile }),

      setSubscription: (subscription) =>
        set({ subscription }),

      setSuperAdmin: (val) =>
        set({ isSuperAdmin: val }),

      hasPermission: (code) => {
        const perms = get().profile?.permissions
        return Array.isArray(perms) && perms.includes(code)
      },

      hasAnyPermission: (...codes) => {
        const perms = get().profile?.permissions
        return Array.isArray(perms) && codes.some(code => perms.includes(code))
      },

      hasAllPermissions: (...codes) => {
        const perms = get().profile?.permissions
        return Array.isArray(perms) && codes.every(code => perms.includes(code))
      },

      isSubscriptionExpired: () => {
        const sub = get().subscription
        if (!sub) return false
        return sub.is_expired === true
      },

      clearAuth: () =>
        set({
          token:         null,
          refreshToken:  null,
          user:          null,
          business:      null,
          profile:       null,
          subscription:  null,
          isSuperAdmin:  false,
        }),
    }),
    {
      name: 'sb-auth',
      partialize: (state) => ({
        token:        state.token,
        refreshToken: state.refreshToken,
        user:         state.user,
        business:     state.business,
        profile:      state.profile,
        subscription: state.subscription,
        isSuperAdmin: state.isSuperAdmin,
      }),
    }
  )
)

export default useAuthStore