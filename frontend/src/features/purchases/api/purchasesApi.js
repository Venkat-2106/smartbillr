// src/features/purchases/api/purchasesApi.js
// HTTP layer only — no authStore, no React state.

import api from '../../../api/axios'

// ── GET paginated list ────────────────────────────────────────────────────────
export async function fetchPurchases({
  page      = 1,
  limit     = 20,
  search    = '',
  status    = '',
  sort_by   = 'pur_created_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/purchases', { params })
  return res.data  // { items: [...], pagination: {...} }
}

// ── LAZY EXPORT ───────────────────────────────────────────────────────────────
export async function fetchAllPurchasesForExport({
  search    = '',
  status    = '',
  sort_by   = 'pur_created_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/purchases', { params })
  return res.data?.items ?? []
}

// ── GET single purchase detail (header + items + returns) ─────────────────────
export async function fetchPurchase(purId) {
  const res = await api.get(`/purchases/${purId}`)
  return res.data
}

// ── PATCH payment status ──────────────────────────────────────────────────────
export async function updatePurchaseStatus(purId, status) {
  const res = await api.patch(`/purchases/${purId}/status`, { status })
  return res.data
}