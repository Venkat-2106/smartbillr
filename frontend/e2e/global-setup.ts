import { FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  API_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USER,
} from './test.env'

const AUTH_FILE = path.resolve('./e2e/.auth/user.json')

async function registerTestUser(): Promise<boolean> {
  const res = await fetch(`${API_URL}/v1/business`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: TEST_USER.businessName,
      owner_name: TEST_USER.ownerName,
      owner_email: TEST_USER.email,
      owner_password: TEST_USER.password,
      business_country_code: 'US',
    }),
  })

  const json = await res.json()

  // success_response returns data directly (no {success, data} wrapper)
  if (res.ok && json.business_id) {
    console.log(`  Registered test user: ${TEST_USER.email}`)
    return true
  }

  // error_response returns {success: false, message: "..."}
  const msg = json.message || ''
  if (msg.includes('already registered') || msg.includes('already exists')) {
    console.log(`  Test user already exists: ${TEST_USER.email}`)
    return true
  }

  console.error(`  Registration failed: ${msg || JSON.stringify(json)}`)
  return false
}

async function loginTestUser(): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase login failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  }
}

async function fetchProfile(token: string) {
  const res = await fetch(`${API_URL}/v1/profiles/me/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Profile fetch failed (${res.status}): ${body}`)
  }
  // success_response returns data directly — no {data: ...} wrapper
  const json = await res.json()
  return json
}

async function fetchTestAuth(token: string) {
  const res = await fetch(`${API_URL}/test-auth`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    return { business_id: '' }
  }
  // success_response returns data directly
  const json = await res.json()
  return json
}

async function fetchSubscription(token: string) {
  const res = await fetch(`${API_URL}/v1/businesses/me/subscription`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    return {
      payment_status: 'pending',
      subscription_type: 'trial',
      is_expired: false,
    }
  }
  // success_response returns data directly
  const json = await res.json()
  return {
    payment_status: json.payment_status ?? 'pending',
    subscription_type: json.subscription_type ?? 'trial',
    is_expired: json.is_expired ?? false,
  }
}

async function globalSetup(config: FullConfig) {
  console.log('\n── E2E Global Setup ──')

  // Step 1: Register test user (idempotent)
  console.log('  Registering test user...')
  await registerTestUser()

  // Step 2: Login via Supabase
  console.log('  Logging in via Supabase...')
  const { access_token, refresh_token } = await loginTestUser()
  console.log('  Login successful')

  // Step 3: Fetch profile with permissions
  console.log('  Fetching user profile...')
  const profile = await fetchProfile(access_token)
  console.log(`  Profile loaded: ${profile.full_name || profile.id} (${profile.role || 'unknown'})`)
  console.log(`  Permissions: ${profile.permissions?.length ?? 0} codes`)

  // Step 4: Fetch business info via /test-auth
  console.log('  Fetching business info...')
  const bizData = await fetchTestAuth(access_token)
  const business = {
    business_id: bizData.business_id || profile.business_id || '',
    business_country_code: 'US',
  }

  // Step 5: Fetch subscription
  console.log('  Fetching subscription...')
  const subscription = await fetchSubscription(access_token)

  // Step 6: Build Zustand auth state
  // DashboardLayout reads `s.permissions` directly from the store,
  // so we must include it at the top level alongside profile.permissions.
  const authState = {
    state: {
      token: access_token,
      refreshToken: refresh_token,
      user: {
        id: profile.id,
        email: profile.email,
      },
      business,
      profile,
      subscription,
      isSuperAdmin: false,
      permissions: profile.permissions ?? [],
    },
    version: 0,
  }

  // Step 7: Save to auth file
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authState, null, 2))
  console.log(`  Auth state saved to ${AUTH_FILE}`)

  console.log('── Global Setup Complete ──\n')
}

export default globalSetup
