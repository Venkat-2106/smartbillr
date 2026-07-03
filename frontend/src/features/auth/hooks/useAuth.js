// src/features/auth/hooks/useAuth.js
//
// CHANGES FROM EXISTING:
//   - useLogin: after /profiles/me response, call setPermissions(profile.permissions)
//     to explicitly store permissions in the store
//   - Added response shape guard: /profiles/me returns { success, data: { ... } }
//   - Everything else (useForgotPassword, useResetPassword, useLogout) unchanged

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { loginWithEmail, refreshAccessToken } from '../api/authApi'
import useAuthStore from '../../../store/authStore'
import api from '../../../api/axios'
import supabase from '../../../lib/supabaseClient'

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const [pendingSession, setPendingSession] = useState(null)
  const { setAuth, setBusiness, setProfile, setPermissions, setSubscription } = useAuthStore()
  const navigate = useNavigate()

  async function login(email, password) {
    setIsLoading(true)
    try {
      const supabaseData = await loginWithEmail(email, password)
      const token = supabaseData.access_token
      const user  = supabaseData.user
      const refreshToken = supabaseData.refresh_token

      setAuth(token, user, refreshToken)

      // Check for existing active session
      const sessionRes = await api.post('/auth/record-login')
      const hasExisting = sessionRes?.data?.has_existing_session

      if (hasExisting) {
        setPendingSession({ token, user, refreshToken })
        return
      }

      await completeLogin(token, user, refreshToken)

    } catch (err) {
      const message =
        err.response?.data?.error_description ||
        err.response?.data?.message           ||
        err.response?.data?.msg               ||
        err.message                           ||
        'Login failed. Check your email and password.'

      toast.error(message)
      setIsLoading(false)
    }
  }

  async function completeLogin(token, user, refreshToken) {
    try {
      const [bizResult, profileResult, subResult] = await Promise.allSettled([
        api.get('/businesses/me'),
        api.get('/profiles/me'),
        api.get('/businesses/me/subscription'),
      ])

      if (bizResult.status === 'fulfilled') {
        const biz = bizResult.value.data
        if (biz) setBusiness(biz)
      }

      if (profileResult.status === 'fulfilled') {
        const profile = profileResult.value.data
        if (profile) {
          setProfile(profile)
          setPermissions(profile.permissions ?? [])
        }
      }

      if (subResult.status === 'fulfilled') {
        const sub = subResult.value.data
        if (sub) {
          setSubscription(sub)
          if (sub.is_expired) {
            toast.error('Your subscription has expired. Please renew to continue.')
            navigate('/subscription', { replace: true })
            return
          }
        }
      }

      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      toast.error('Failed to load profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  async function confirmSession() {
    if (!pendingSession) return
    try {
      await api.post('/auth/confirm-session')
    } catch {
      // Proceed even if confirm fails
    }
    setPendingSession(null)
    await completeLogin(pendingSession.token, pendingSession.user, pendingSession.refreshToken)
  }

  async function cancelSession() {
    if (!pendingSession) return
    try {
      await api.post('/auth/logout')
    } catch {
      // Clear locally even if backend call fails
    }
    useAuthStore.getState().clearAuth()
    setPendingSession(null)
    setIsLoading(false)
    toast('Login cancelled. The new session has been logged out.')
    navigate('/login', { replace: true })
  }

  return { login, isLoading, pendingSession, confirmSession, cancelSession }
}

// ─── useLogout ────────────────────────────────────────────────────────────────
// Calls backend /auth/logout to blacklist the JWT, then clears local state.
// If the backend call fails (e.g. network error), local state is still cleared
// so the user is never stuck logged in.
export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const navigate  = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  async function logout() {
    setIsLoading(true)
    try {
      await api.post('/auth/logout')
    } catch {
      // Backend unreachable or token already invalid — still clear local state
    } finally {
      clearAuth()
      toast.success('Logged out successfully')
      navigate('/login')
      setIsLoading(false)
    }
  }

  return { logout, isLoading }
}

// ─── useForgotPassword ────────────────────────────────────────────────────────
export function useForgotPassword() {
  const [isLoading, setIsLoading] = useState(false)

  async function sendResetEmail(email) {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Enter your email address first, then click Forgot password')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      toast.success('If an account exists for this email, a reset link has been sent')
    } catch (err) {
      const msg = (err?.message || '').toLowerCase()
      if (msg.includes('not found') || msg.includes('no user') || msg.includes('no account')) {
        toast.success('If an account exists for this email, a reset link has been sent')
      } else {
        toast.error(err.message || 'Could not send reset email. Try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return { sendResetEmail, isLoading }
}

// ─── useResetPassword ─────────────────────────────────────────────────────────
// Unchanged from existing
export function useResetPassword() {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  async function resetPassword(newPassword) {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      toast.success('Password updated — please sign in')
      navigate('/login')
    } catch (err) {
      toast.error(err.message || 'Could not update password. The link may have expired.')
    } finally {
      setIsLoading(false)
    }
  }

  return { resetPassword, isLoading }
}

// ─── refreshAuthToken ──────────────────────────────────────────────────────────
// Refreshes the JWT using the stored refresh token from Zustand.
// Returns the new access_token on success, or null on failure.
// Used by the axios response interceptor and for manual refresh needs.
export async function refreshAuthToken() {
  const { refreshToken, setAuth, user } = useAuthStore.getState()
  if (!refreshToken) return null

  try {
    const data = await refreshAccessToken(refreshToken)
    const newToken = data.access_token
    const newRefreshToken = data.refresh_token
    setAuth(newToken, user, newRefreshToken)
    return newToken
  } catch {
    return null
  }
}