// src/store/authStore.js
//
// CHANGE FROM EXISTING:
//   - setProfile() already stores permissions from profile.permissions ✅ (keep)
//   - Added setPermissions() as an explicit setter for useAuth.js to call directly
//   - Added hasAnyPermission() helper
//   - Added canAll() helper
//   Everything else unchanged.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      token:       null,
      user:        null,
      business:    null,
      profile:     null,
      permissions: [],

      setAuth: (token, user) =>
        set({ token, user }),

      setBusiness: (business) =>
        set({ business }),

      setProfile: (profile) =>
        set({
          profile,
          // Auto-extract permissions when profile is set
          permissions: profile?.permissions || [],
        }),

      // Explicit setter — called by useAuth.js after /profiles/me
      setPermissions: (permissions) =>
        set({ permissions: Array.isArray(permissions) ? permissions : [] }),

      // ── Permission helpers ──────────────────────────────────────────────
      // Use these anywhere in frontend instead of checking role directly.
      // Same logic as require_permission() on the backend.

      hasPermission: (code) => {
        const perms = get().permissions
        return Array.isArray(perms) && perms.includes(code)
      },

      hasAnyPermission: (...codes) => {
        const perms = get().permissions
        return Array.isArray(perms) && codes.some(code => perms.includes(code))
      },

      hasAllPermissions: (...codes) => {
        const perms = get().permissions
        return Array.isArray(perms) && codes.every(code => perms.includes(code))
      },

      clearAuth: () =>
        set({
          token:       null,
          user:        null,
          business:    null,
          profile:     null,
          permissions: [],
        }),
    }),
    {
      name: 'sb-auth',
      partialize: (state) => ({
        token:       state.token,
        user:        state.user,
        business:    state.business,
        profile:     state.profile,
        permissions: state.permissions,
      }),
    }
  )
)

export default useAuthStore