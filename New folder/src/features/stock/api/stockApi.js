// src/features/stock/api/stockApi.js
//
// HTTP calls only — no authStore imports.
// Covers all three stock sub-pages:
//   GET  /stock/current   → Current Stock tab
//   GET  /stock/movements → Stock Movements tab
//   GET  /stock/alerts    → Low Stock Alerts tab
//   POST /stock/adjust    → Adjust Stock modal

import api from '../../../api/axios'

// ── Current Stock list (paginated, server-side filter/sort) ───────────────────
export async function fetchStock({
  page        = 1,
  limit       = 20,
  search      = '',
  category_id = '',
  status      = '',
  is_active   = '',
  sort_by     = 'prod_name',
  sort_dir    = 'asc',
} = {}) {
  const params = { page, limit }
  if (search && search.trim())  params.search      = search.trim()
  if (category_id)              params.category_id = category_id
  if (status)                   params.status      = status
  if (is_active)                params.is_active   = is_active
  if (sort_by)                  params.sort_by     = sort_by
  if (sort_dir)                 params.sort_dir    = sort_dir

  const res = await api.get('/stock/current', { params })
  return res.data  // { items: [...], pagination: {...} }
}

// ── Lazy export — fetches ALL matching rows only when export is clicked ────────
export async function fetchAllStockForExport({
  search      = '',
  category_id = '',
  status      = '',
  is_active   = '',
  sort_by     = 'prod_name',
  sort_dir    = 'asc',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search && search.trim())  params.search      = search.trim()
  if (category_id)              params.category_id = category_id
  if (status)                   params.status      = status
  if (is_active)                params.is_active   = is_active
  if (sort_by)                  params.sort_by     = sort_by
  if (sort_dir)                 params.sort_dir    = sort_dir

  const res = await api.get('/stock/current', { params })
  return res.data?.items ?? []
}

// ── Stock Movements list (paginated, server-side filter/sort) ─────────────────
// Backend: GET /stock/movements
//   Supports: search (prod_name), move_type, date_from, date_to, sort_by, sort_dir
export async function fetchMovements({
  page      = 1,
  limit     = 20,
  search    = '',
  move_type = '',
  date_from = '',
  date_to   = '',
  sort_by   = 'move_created_at',
  sort_dir  = 'desc',
} = {}) {
  const params = { page, limit }
  if (search && search.trim()) params.search    = search.trim()
  if (move_type)               params.move_type = move_type
  if (date_from)               params.date_from = date_from
  if (date_to)                 params.date_to   = date_to
  if (sort_by)                 params.sort_by   = sort_by
  if (sort_dir)                params.sort_dir  = sort_dir

  const res = await api.get('/stock/movements', { params })
  return res.data  // { items: [...], pagination: {...} }
}

// ── Movements export — all matching rows ──────────────────────────────────────
export async function fetchAllMovementsForExport({
  search    = '',
  move_type = '',
  date_from = '',
  date_to   = '',
  sort_by   = 'move_created_at',
  sort_dir  = 'desc',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search && search.trim()) params.search    = search.trim()
  if (move_type)               params.move_type = move_type
  if (date_from)               params.date_from = date_from
  if (date_to)                 params.date_to   = date_to
  if (sort_by)                 params.sort_by   = sort_by
  if (sort_dir)                params.sort_dir  = sort_dir

  const res = await api.get('/stock/movements', { params })
  return res.data?.items ?? []
}

// ── Low Stock Alerts (paginated) ──────────────────────────────────────────────
// Backend: GET /stock/alerts
//   Supports: page, limit only (no search/filter at backend level)
export async function fetchAlerts({ page = 1, limit = 20 } = {}) {
  const res = await api.get('/stock/alerts', { params: { page, limit } })
  return res.data  // { items: [...], pagination: {...} }
}

// ── Mark Alert as Read ────────────────────────────────────────────────────────
// Backend: PUT /stock/alerts/{alert_id}/read
export async function markAlertRead(alertId) {
  const res = await api.put(`/stock/alerts/${alertId}/read`)
  return res.data
}

// ── Adjust Stock ──────────────────────────────────────────────────────────────
// Backend: POST /stock/adjust
//   Body: { product_id, adjustment_type: "add"|"remove"|"set", qty, move_notes? }
//   Permission required: stock.adjust
export async function adjustStock(payload) {
  const res = await api.post('/stock/adjust', payload)
  return res.data
}
// ---- Stock summary (KPI cards) -------------------------------------------------------
export async function fetchStockSummary() {
  const res = await api.get('/stock/summary')
  return res.data
}
