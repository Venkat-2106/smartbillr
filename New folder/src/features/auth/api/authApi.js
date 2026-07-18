import axios from 'axios'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export async function loginWithEmail(email, password) {
  const response = await axios.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    { email, password },
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    }
  )
  return response.data
}

export async function refreshAccessToken(refreshToken) {
  const response = await axios.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    { refresh_token: refreshToken },
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    }
  )
  return response.data
}