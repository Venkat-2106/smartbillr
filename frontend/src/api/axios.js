// src/api/axios.js
//
// CHANGES:
//   Added response interceptor for 401 handling.
//
//   BEFORE: When the JWT expired after 1 hour, every API call returned 401
//   silently. The user saw error banners but stayed on the broken page with
//   no way to recover except manually refreshing and logging in again.
//
//   AFTER: A response interceptor catches any 401, clears the auth store,
//   and redirects to /login. The user gets a clean login screen immediately.
//
//   WHY window.location.href and not useNavigate():
//     useNavigate() is a React hook — it can only be called inside a
//     React component or custom hook. An axios interceptor runs outside
//     React entirely, so we use window.location.href which works anywhere.
//     The hard redirect also clears any stale React state, which is what
//     we want on session expiry.

import axios from 'axios'
import useAuthStore from '../store/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor ───────────────────────────────────────────────────────
// Attaches JWT Bearer token from Zustand store to every outgoing request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }

  return config
})

// ── Response interceptor ──────────────────────────────────────────────────────
// Catches 401 (token expired / invalid) and redirects to login.
// All other errors are passed through to the calling code unchanged.
api.interceptors.response.use(
  // Success — pass response through untouched
  (response) => response,

  // Error — handle 401, re-throw everything else
  (error) => {
    if (error.response?.status === 401) {
      // Clear Zustand store + localStorage (Zustand persist)
      useAuthStore.getState().clearAuth()

      // Hard redirect — clears all React state, gives user a clean login page
      // Avoid redirect loop: only redirect if not already on /login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }

    // Re-throw so React Query / individual catch blocks still get the error
    return Promise.reject(error)
  }
)

export default api