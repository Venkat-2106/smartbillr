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
import { refreshAccessToken } from '../features/auth/api/authApi'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
})

let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })
  failedQueue = []
}

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000
  } catch {
    return null
  }
}

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().token
  const refreshToken = useAuthStore.getState().refreshToken
  if (token) {
    const exp = getTokenExpiry(token)
    if (exp && Date.now() + 60000 > exp && refreshToken && !isRefreshing) {
      isRefreshing = true
      try {
        const data = await refreshAccessToken(refreshToken)
        const { access_token, refresh_token: newRefreshToken } = data
        useAuthStore.getState().setAuth(access_token, useAuthStore.getState().user, newRefreshToken)
        processQueue(null, access_token)
        config.headers['Authorization'] = `Bearer ${access_token}`
        return config
      } catch (err) {
        processQueue(err, null)
      } finally {
        isRefreshing = false
      }
    }
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config

    // 402 Payment Required — subscription expired
    if (error.response?.status === 402) {
      if (!window.location.pathname.includes('/subscription')) {
        window.location.href = '/subscription'
      }
      return Promise.reject(error)
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    const { refreshToken } = useAuthStore.getState()
    if (!refreshToken) {
      useAuthStore.getState().clearAuth()
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers['Authorization'] = `Bearer ${token}`
        return api(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const data = await refreshAccessToken(refreshToken)
      const { access_token, refresh_token } = data
      useAuthStore.getState().setAuth(access_token, useAuthStore.getState().user, refresh_token)

      processQueue(null, access_token)

      originalRequest.headers['Authorization'] = `Bearer ${access_token}`
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      useAuthStore.getState().clearAuth()
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api