import { Page } from '@playwright/test'
import { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../test.env'

interface AuthStorageState {
  token: string
  refreshToken: string
  user: { id: string; email: string }
  business: Record<string, unknown>
  profile: {
    id: string
    full_name: string
    role: string
    email: string
    is_active: boolean
    business_id: string
    permissions: string[]
    is_admin: boolean
    is_manager: boolean
    is_staff: boolean
  }
  subscription: {
    payment_status: string
    subscription_type: string
    is_expired: boolean
  }
  isSuperAdmin: boolean
}

/**
 * Inject the Zustand-persisted auth state into the page's localStorage.
 * This allows the page to think the user is already logged in.
 */
export async function injectAuthState(page: Page, state: AuthStorageState) {
  const zustandPayload = {
    state,
    version: 0,
  }

  await page.evaluate((payload) => {
    localStorage.setItem('sb-auth', JSON.stringify(payload))
  }, zustandPayload)
}

/**
 * Get the user's profile (including permissions) from the backend API.
 */
export async function fetchUserProfile(
  accessToken: string,
): Promise<AuthStorageState['profile']> {
  const res = await fetch(`${API_URL}/v1/profiles/me/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch profile: ${res.status}`)
  }

  const json = await res.json()
  return json.data
}

/**
 * Get the user's business from the backend API.
 */
export async function fetchBusiness(
  accessToken: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/v1/business/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch business: ${res.status}`)
  }

  const json = await res.json()
  return json.data
}

/**
 * Get the user's subscription from the backend API.
 */
export async function fetchSubscription(
  accessToken: string,
): Promise<AuthStorageState['subscription']> {
  const res = await fetch(`${API_URL}/v1/subscription/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    // Subscription might not exist yet for new users
    return {
      payment_status: 'pending',
      subscription_type: 'trial',
      is_expired: false,
    }
  }

  const json = await res.json()
  return {
    payment_status: json.data?.payment_status ?? 'pending',
    subscription_type: json.data?.subscription_type ?? 'trial',
    is_expired: json.data?.is_expired ?? false,
  }
}
