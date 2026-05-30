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
import { loginWithEmail } from '../api/authApi'
import useAuthStore from '../../../store/authStore'
import api from '../../../api/axios'
import supabase from '../../../lib/supabaseClient'

// ─── useLogin ─────────────────────────────────────────────────────────────────
export function useLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const { setAuth, setBusiness, setProfile, setPermissions } = useAuthStore()
  const navigate = useNavigate()

  async function login(email, password) {
    setIsLoading(true)
    try {
      const supabaseData = await loginWithEmail(email, password)
      const token = supabaseData.access_token
      const user  = supabaseData.user

      setAuth(token, user)

      // Fetch business
      try {
        const bizRes = await api.get('/businesses/me')
        const biz = bizRes.data
        if (biz) setBusiness(biz)
      } catch (bizErr) {
        console.warn('Could not load business profile:', bizErr.message)
      }

      // Fetch profile + permissions
      try {
        const profileRes = await api.get('/profiles/me')
        // Backend returns data directly — no wrapper
        const profile = profileRes.data
        if (profile) {
          setProfile(profile)
          // Explicitly store permissions so they are always in sync
          setPermissions(profile.permissions ?? [])
        }
      } catch (profileErr) {
        console.warn('Could not load user profile:', profileErr.message)
      }

      toast.success('Welcome back!')
      navigate('/dashboard')

    } catch (err) {
      const message =
        err.response?.data?.error_description ||
        err.response?.data?.message           ||
        err.response?.data?.msg               ||
        err.message                           ||
        'Login failed. Check your email and password.'

      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return { login, isLoading }
}

// ─── useLogout ────────────────────────────────────────────────────────────────
// Unchanged from existing — clearAuth() already clears permissions
export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const navigate  = useNavigate()

  function logout() {
    clearAuth()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return { logout }
}

// ─── useForgotPassword ────────────────────────────────────────────────────────
// Unchanged from existing
export function useForgotPassword() {
  const [isLoading, setIsLoading] = useState(false)

  async function sendResetEmail(email) {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Enter your email address first, then click Forgot password')
      return
    }

    setIsLoading(true)
    try {
      try {
        await api.get('/profiles/check-email', { params: { email } })
      } catch (checkErr) {
        if (checkErr.response?.status === 404) {
          toast.error('This email is not registered with SmartBillr')
          return
        }
        toast.error('Could not verify email. Make sure the backend is running.')
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      toast.success('Password reset link sent — check your inbox')

    } catch (err) {
      toast.error(err.message || 'Could not send reset email. Try again.')
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