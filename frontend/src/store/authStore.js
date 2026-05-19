import { create } from 'zustand'

const useAuthStore = create((set) => ({
  // STATE — what we store
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  business_id: localStorage.getItem('business_id') || null,
  isAuthenticated: !!localStorage.getItem('token'),

  // ACTION — called after successful login
  setAuth: (token, user, business_id) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('business_id', business_id)
    set({ token, user, business_id, isAuthenticated: true })
  },

  // ACTION — called on logout
  clearAuth: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('business_id')
    set({ token: null, user: null, business_id: null, isAuthenticated: false })
  },
}))

export default useAuthStore