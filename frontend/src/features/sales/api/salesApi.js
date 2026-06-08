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

// ── Lean product search for the sales entry form (server-side, min 2 chars) ──
//
// WHY THIS REPLACES fetchProductsForSale:
//   The old approach fetched all products (limit=500) on page load. At 500+
//   products this is a large payload. At 10,000+ products it breaks silently.
//   The new lean endpoint (/products/search?q=X) is called on each keystroke
//   (debounced in CreateSalePage). It returns at most 20 lightweight rows,
//   skipping all profile JOINs and audit fields.
//
// BARCODE LOOKUP:
//   An exact barcode scan calls GET /products/barcode/{code} directly (already
//   exists). searchProductsLean is for the dropdown search only.
export const searchProductsLean = async (q) => {
  if (!q || q.trim().length < 2) return []
  const res = await api.get('/products/search', { params: { q: q.trim(), limit: 20 } })
  // Backend returns array directly (success_response wraps array as-is)
  const data = res.data
  if (Array.isArray(data)) return data
  return []
}

// ── Exact barcode lookup for scanner input in the sales form ──────────────────
export const fetchProductByBarcode = async (code) => {
  const res = await api.get(`/products/barcode/${encodeURIComponent(code.trim())}`)
  return res.data   // full product row (with profit fields if permitted)
}