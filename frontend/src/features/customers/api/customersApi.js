// src/features/customers/api/customersApi.js
//
// OPTIMIZED:
//   - fetchCustomers now accepts `search` param → passes to backend
//   - No more limit=1000 pattern — backend handles filtering
//   - All other functions unchanged

import api from '../../../api/axios'

// ── List (paginated + server-side search) ────────────────────────────────────
// Backend: GET /customers/?search=abc&page=1&limit=20
// Returns: { items: [...], pagination: { total, page, limit, total_pages, has_next, has_prev } }
export async function fetchCustomers({ page = 1, limit = 20, search = '' } = {}) {
  const params = { page, limit }
  if (search && search.trim()) params.search = search.trim()
  const res = await api.get('/customers/', { params })
  return res.data
}

// ── Single customer (detail + summary + full sales history) ──────────────────
export async function fetchCustomer(custId) {
  const res = await api.get(`/customers/${custId}`)
  return res.data
}

// ── Create ───────────────────────────────────────────────────────────────────
export async function createCustomer(payload) {
  const res = await api.post('/customers/', payload)
  return res.data
}

// ── Update ───────────────────────────────────────────────────────────────────
export async function updateCustomer(custId, payload) {
  const res = await api.put(`/customers/${custId}`, payload)
  return res.data
}

// ── Delete (soft) ────────────────────────────────────────────────────────────
export async function deleteCustomer(custId) {
  const res = await api.delete(`/customers/${custId}`)
  return res.data
}
