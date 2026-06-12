// src/features/stock/api/stockApi.js
//
// HTTP calls only — mirrors features/products/api/productsApi.js pattern.
// Hits GET /stock/current (paginated, server-side search/filter/sort).
// NEVER import authStore here.

import api from '../../../api/axios'

// ── Paginated stock list (table view) — server-side filter/sort/paginate ──────
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

// ── Lazy export — fetches ALL matching rows only when export is clicked ───────
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