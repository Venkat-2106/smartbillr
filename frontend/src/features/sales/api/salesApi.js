// src/features/sales/api/salesApi.js
//
// EXPORT FIX — 2026-06-06
// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM:
//   fetchAllSalesForExport() used limit=1000. Businesses with > 1000 invoices
//   had records silently truncated in exports.
//
// FIX:
//   Raised limit to 10000. Backend le cap raised to 10000 in pagination.py.
//   All other functions unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import api from '../../../api/axios'

// ── Sales list — server-side paginated (table view) ───────────────────────────
export const fetchSales = async ({ page = 1, limit = 20, search, status, date_from, date_to } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page,
      limit,
      search:    search    || undefined,
      status:    status    || undefined,
      date_from: date_from || undefined,
      date_to:   date_to   || undefined,
    },
  })
  return res.data
}

// ── Single sale detail ────────────────────────────────────────────────────────
export const fetchSale = async (id) => {
  const res = await api.get(`/sales/${id}`)
  return res.data
}

// ── Create new sale ───────────────────────────────────────────────────────────
export const createSale = async (body) => {
  const res = await api.post('/sales', body)
  return res.data
}

// ── Update payment status ─────────────────────────────────────────────────────
export const updateSaleStatus = async (id, payment_status) => {
  const res = await api.patch(`/sales/${id}/status`, { status: payment_status })
  return res.data
}

// ── Export: fetch ALL matching sales in one call ──────────────────────────────
// EXPORT FIX: limit raised from 1000 → 10000.
// Businesses with > 1000 invoices now get their full export.
export const fetchAllSalesForExport = async ({ search, status, date_from, date_to } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page:      1,
      limit:     10000,
      search:    search    || undefined,
      status:    status    || undefined,
      date_from: date_from || undefined,
      date_to:   date_to   || undefined,
    },
  })
  return res.data?.items ?? []
}

// ── Customers dropdown (Create Invoice) ──────────────────────────────────────
export const fetchCustomersForSale = async () => {
  const res = await api.get('/customers', { params: { limit: 500 } })
  const data = res.data
  if (Array.isArray(data))         return data
  if (Array.isArray(data?.items))  return data.items
  return []
}

// ── Products dropdown (Create Invoice) ───────────────────────────────────────
export const fetchProductsForSale = async () => {
  const res = await api.get('/products', { params: { limit: 500 } })
  const data = res.data
  if (Array.isArray(data))         return data
  if (Array.isArray(data?.items))  return data.items
  return []
}
