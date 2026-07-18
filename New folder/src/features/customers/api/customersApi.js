// src/features/customers/api/customersApi.js
//
// SCALABILITY FIX:
//   fetchCustomers() no longer loads limit=10000 into the browser.
//   It now accepts filter params and fetches only the current page
//   (limit=20 by default). The database does all filtering, sorting,
//   and counting before returning rows.
//
//   fetchAllCustomersForExport() is a separate lazy call used only
//   when the Export button is clicked. It sends the same active filter
//   params with limit=10000 so the CSV always contains all matching
//   records — not just what is visible on screen.

import api from '../../../api/axios'

// ── GET PAGINATED LIST — server-side filter/sort/paginate ─────────────────────
// Called by useCustomers() on every page load and whenever filters change.
// The backend applies search, sort, date filter, and OFFSET/LIMIT in SQL.
export async function fetchCustomers({
  page         = 1,
  limit        = 20,
  search       = '',
  sort_by      = 'updated_at',
  sort_dir     = 'desc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())    params.search       = search.trim()
  if (sort_by)          params.sort_by      = sort_by
  if (sort_dir)         params.sort_dir     = sort_dir
  if (updated_from)     params.updated_from = updated_from
  if (updated_to)       params.updated_to   = updated_to

  const res = await api.get('/customers', { params })
  return res.data   // { items: [...], pagination: { total, page, ... } }
}

// ── LAZY EXPORT — fetches ALL matching rows only when export is clicked ────────
// Sends the same active filter params with limit=10000.
// Returns a flat array of records (not the pagination envelope).
export async function fetchAllCustomersForExport({
  search       = '',
  sort_by      = 'updated_at',
  sort_dir     = 'desc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())    params.search       = search.trim()
  if (sort_by)          params.sort_by      = sort_by
  if (sort_dir)         params.sort_dir     = sort_dir
  if (updated_from)     params.updated_from = updated_from
  if (updated_to)       params.updated_to   = updated_to

  const res = await api.get('/customers', { params })
  return res.data?.items ?? []
}

// ── GET SINGLE CUSTOMER (with paginated sales history) ────────────────────────
export async function fetchCustomer(custId, { page = 1, limit = 10 } = {}) {
  const res = await api.get(`/customers/${custId}`, {
    params: { page, limit },
  })
  return res.data
}

// ── CREATE CUSTOMER ───────────────────────────────────────────────────────────
export async function createCustomer(payload) {
  const res = await api.post('/customers', payload)
  return res.data
}

// ── UPDATE CUSTOMER ───────────────────────────────────────────────────────────
export async function updateCustomer(id, payload) {
  const res = await api.put(`/customers/${id}`, payload)
  return res.data
}

// ── DELETE CUSTOMER (soft) ────────────────────────────────────────────────────
export async function deleteCustomer(id) {
  const res = await api.delete(`/customers/${id}`)
  return res.data
}
// ---- Customer summary (KPI cards) ----------------------------------------------------
export async function fetchCustomerSummary() {
  const res = await api.get('/customers/summary')
  return res.data
}
