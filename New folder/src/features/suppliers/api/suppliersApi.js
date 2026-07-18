// src/features/suppliers/api/suppliersApi.js
//
// SCALABILITY FIX — replaces the old limit=10000 dump approach.
//
// BEFORE (broken at scale):
//   fetchSuppliers() fetched limit=10000 with NO filter params.
//   The browser received up to 10,000 rows on every page load.
//   useSuppliers.js then filtered, sorted, and paginated in JavaScript.
//   This broke silently for businesses with > 10,000 suppliers.
//
// AFTER (unlimited scale):
//   fetchSuppliers() sends active filters to the backend as query params.
//   PostgreSQL does the filtering, sorting, counting, and OFFSET/LIMIT.
//   The browser receives only the 20 rows for the current page.
//
//   fetchAllSuppliersForExport() is a separate lazy call — only triggered
//   when the Export button is clicked. It sends the same active filter params
//   with limit=10000 so the CSV always contains all matching records, not
//   just what is on screen. If the result is capped at 10,000, the backend
//   sets pagination.truncated = true so the hook can warn the user.
//
// ARCHITECTURE RULES PRESERVED:
//   - res.data used directly (no double wrapper — backend returns data directly)
//   - authStore is NOT imported here
//   - Axios instance from api/axios.js used for all requests

import api from '../../../api/axios'

// ── GET PAGINATED LIST — server-side filter / sort / paginate ─────────────────
// Called by useSuppliers() on every page load and whenever filters change.
// The backend applies search, sort, date filter, and OFFSET/LIMIT in SQL.
export async function fetchSuppliers({
  page         = 1,
  limit        = 20,
  search       = '',
  sort_by      = 'updated_at',
  sort_dir     = 'desc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())  params.search       = search.trim()
  if (sort_by)        params.sort_by      = sort_by
  if (sort_dir)       params.sort_dir     = sort_dir
  if (updated_from)   params.updated_from = updated_from
  if (updated_to)     params.updated_to   = updated_to

  const res = await api.get('/suppliers', { params })
  return res.data   // { items: [...], pagination: { total, page, ... } }
}

// ── LAZY EXPORT — fetches ALL matching rows only when export is clicked ────────
// Sends the same active filter params with limit=10000.
// Returns a flat array of records (not the pagination envelope).
// The caller (useSuppliers handleExport) checks pagination.truncated to warn
// the user when results were capped.
export async function fetchAllSuppliersForExport({
  search       = '',
  sort_by      = 'updated_at',
  sort_dir     = 'desc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())  params.search       = search.trim()
  if (sort_by)        params.sort_by      = sort_by
  if (sort_dir)       params.sort_dir     = sort_dir
  if (updated_from)   params.updated_from = updated_from
  if (updated_to)     params.updated_to   = updated_to

  const res = await api.get('/suppliers', { params })
  return res.data?.items ?? []
}

// ── GET SINGLE SUPPLIER ───────────────────────────────────────────────────────
export const fetchSupplier = async (id) => {
  const res = await api.get(`/suppliers/${id}`)
  return res.data
}

// ── CREATE SUPPLIER ───────────────────────────────────────────────────────────
export const createSupplier = async (body) => {
  const res = await api.post('/suppliers', body)
  return res.data
}

// ── UPDATE SUPPLIER ───────────────────────────────────────────────────────────
export const updateSupplier = async (id, body) => {
  const res = await api.put(`/suppliers/${id}`, body)
  return res.data
}

// ── DELETE SUPPLIER (soft) ────────────────────────────────────────────────────
export const deleteSupplier = async (id) => {
  const res = await api.delete(`/suppliers/${id}`)
  return res.data
}