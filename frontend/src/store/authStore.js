import { create } from 'zustand'

// ─── Helper: safely parse JSON from localStorage ─────────
function load(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ─── Zustand Auth Store ──────────────────────────────────
// ALL three pieces are persisted in localStorage so they
// survive page refresh without needing to re-fetch.
//
//   token    → JWT string
//   business → { business_name, ... } from /businesses/me
//   profile  → { full_name, role, ... } from /profiles/me

const useAuthStore = create((set) => ({
  token:    localStorage.getItem('token')   || null,
  user:     load('sb_user')                 || null,
  business: load('sb_business')            || null,
  profile:  load('sb_profile')             || null,

  setAuth: (token, user, business) => {
    localStorage.setItem('token', token)
    localStorage.setItem('sb_user', JSON.stringify(user))
    set({ token, user, business })
  },

  setBusiness: (business) => {
    localStorage.setItem('sb_business', JSON.stringify(business))
    set({ business })
  },

  setProfile: (profile) => {
    localStorage.setItem('sb_profile', JSON.stringify(profile))
    set({ profile })
  },

  clearAuth: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('sb_user')
    localStorage.removeItem('sb_business')
    localStorage.removeItem('sb_profile')
    set({ token: null, user: null, business: null, profile: null })
  },
}))

export default useAuthStore