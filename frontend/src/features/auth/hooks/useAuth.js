import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { loginWithEmail } from '../api/authApi'
import useAuthStore from '../../../store/authStore'
import api from '../../../api/axios'

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const setAuth = useAuthStore((state) => state.setAuth)
  const navigate = useNavigate()

  async function login(email, password) {
    setIsLoading(true)
    try {
      // Step 1: Get JWT from Supabase
      const supabaseData = await loginWithEmail(email, password)
      const token = supabaseData.access_token
      const user = supabaseData.user

      // Step 2: Temporarily store token so interceptor attaches it
      localStorage.setItem('token', token)

      // Step 3: Call our FastAPI to get business_id
      const profileRes = await api.get('/businesses/me')
      const business_id = profileRes.data?.data?.business_id

      // Step 4: Save everything to Zustand + localStorage
      setAuth(token, user, business_id)

      toast.success('Welcome back!')
      navigate('/dashboard')

    } catch (err) {
      // Clean up partial token if login failed
      localStorage.removeItem('token')

      const message = err.response?.data?.message
        || err.response?.data?.error_description
        || 'Login failed. Check your email and password.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return { login, isLoading }
}

export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const navigate = useNavigate()

  function logout() {
    clearAuth()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return { logout }
}