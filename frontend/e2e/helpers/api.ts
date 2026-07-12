import { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER } from '../test.env'

let accessToken: string | null = null

export function setAccessToken(token: string) {
  accessToken = token
}

export function getAccessToken(): string {
  if (!accessToken) throw new Error('Access token not set. Run global-setup first.')
  return accessToken
}

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const url = `${API_URL}/v1${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiGet(path: string): Promise<any> {
  const res = await apiRequest('GET', path)
  return res.json()
}

export async function apiPost(path: string, body: unknown): Promise<any> {
  const res = await apiRequest('POST', path, body)
  return res.json()
}

export async function apiPut(path: string, body: unknown): Promise<any> {
  const res = await apiRequest('PUT', path, body)
  return res.json()
}

export async function apiDelete(path: string): Promise<any> {
  const res = await apiRequest('DELETE', path)
  return res.json()
}

// ── Category-specific API helpers ──

export async function createCategoryViaApi(name: string): Promise<any> {
  const res = await apiPost('/categories/', { category_name: name })
  return res
}

export async function deleteCategoryViaApi(categoryId: string): Promise<any> {
  const res = await apiDelete(`/categories/${categoryId}/`)
  return res
}

export async function listCategoriesViaApi(params?: {
  page?: number
  limit?: number
  search?: string
}): Promise<any> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.search) searchParams.set('search', params.search)
  const qs = searchParams.toString()
  return apiGet(`/categories/${qs ? '?' + qs : ''}`)
}

export async function getCategoryViaApi(categoryId: string): Promise<any> {
  return apiGet(`/categories/${categoryId}/`)
}

// ── Supabase login helper ──

export async function loginViaSupabase(
  email: string,
  password: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
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

// ── Supabase signup helper ──

export async function signupViaSupabase(
  email: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.text()
    // 400 with "User already registered" is fine for our purposes
    if (err.includes('already') || err.includes('registered')) return
    throw new Error(`Supabase signup failed: ${res.status} ${err}`)
  }
}

// ── Seed categories via direct SQL (uses the backend API) ──

export async function seedCategoriesViaApi(
  count: number,
  prefix = 'E2E Seed',
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const name = `${prefix} ${String(i + 1).padStart(3, '0')}`
    const res = await createCategoryViaApi(name)
    // success_response returns data directly — no {success, data} wrapper
    if (res.category_id) {
      ids.push(res.category_id)
    }
  }
  return ids
}

// ── Cleanup multiple categories ──

export async function cleanupCategories(ids: string[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    try {
      await deleteCategoryViaApi(id)
    } catch {
      // ignore cleanup errors
    }
  }))
}
