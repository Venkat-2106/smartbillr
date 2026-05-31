import axios from 'axios'

// We call Supabase Auth DIRECTLY (not our FastAPI backend)
// Supabase gives us back a JWT token
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
  // Returns: { access_token, user: { id, email, ... } }
  return response.data
}