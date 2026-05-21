import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { loginWithEmail } from '../api/authApi'
import useAuthStore from '../../../store/authStore'
import api from '../../../api/axios'

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const { setAuth, setBusiness, setProfile } = useAuthStore()
  const navigate = useNavigate()

  async function login(email, password) {
    setIsLoading(true)
    try {

      // ── Step 1: Get JWT from Supabase ──────────────────
      // Supabase returns: { access_token, user: { id, email } }
      const supabaseData = await loginWithEmail(email, password)
      const token = supabaseData.access_token
      const user  = supabaseData.user

      // ── Step 2: Store token so axios interceptor can attach it ──
      localStorage.setItem('token', token)
      setAuth(token, user, null)

      // ── Step 3: Fetch business name from FastAPI ───────
      // GET /businesses/me → { business_name, country_code, ... }
      
      try {
        const bizRes = await api.get('/businesses/me')
        if (bizRes.data?.business_name) {
          setBusiness(bizRes.data)
        }
      } catch (bizErr) {
        console.warn('Could not load business profile:', bizErr.message)
      }

      // ── Step 4: Fetch real profile name from FastAPI ───
      // GET /profiles/me → { full_name, role, ... }
      // This gives us the real name from the profiles table
      // instead of falling back to the email address

      try {
        const profileRes = await api.get('/profiles/me')
        if (profileRes.data?.full_name) {
          setProfile(profileRes.data)
        }
      } catch (profileErr) {
        console.warn('Could not load user profile:', profileErr.message)
      }

      toast.success('Welcome back!')
      navigate('/dashboard')

    } catch (err) {
      localStorage.removeItem('token')
      const message =
        err.response?.data?.error_description ||
        err.response?.data?.message           ||
        err.message                           ||
        'Login failed. Check your email and password.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return { login, isLoading }
}

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
