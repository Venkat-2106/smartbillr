// src/features/sales/api/salesApi.js
//
// PERF FIX (2026-06):
// ─────────────────────────────────────────────────────────────────────────────
// fetchCustomersForSale: switched from GET /customers?limit=500 to
//   GET /customers/lean.
//
// PROBLEM WITH OLD APPROACH:
//   GET /customers?limit=500 returns full customer objects — 20+ fields
//   per row (address, state, country_code, cust_tax_number, audit dates,
//   last_updated_by which requires a profile JOIN, etc.).
//   500 rows × ~20 fields = a large JSON payload over the network,
//   a large parse time in the browser, and large React state.
//   This was the #1 cause of the Create Invoice page feeling slow on load.
//
// NEW APPROACH:
//   GET /customers/lean returns only {cust_id, cust_name, cust_phone}.
//   3 fields per row. No profile JOIN. No audit fields. No address fields.
//   The payload is ~85% smaller for a 500-customer business.
//   The backend uses a covering index (index-only scan — no heap access).
// ─────────────────────────────────────────────────────────────────────────────
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
export const fetchSales = async ({ page = 1, limit = 20, search, status, date_from, date_to, sort_by, sort_dir } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page,
      limit,
      search:    search    || undefined,
      status:    status    || undefined,
      date_from: date_from || undefined,
      date_to:   date_to   || undefined,
      sort_by:   sort_by   || undefined,
      sort_dir:  sort_dir  || undefined,
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

// ── Customers lean dropdown (Create Invoice) ──────────────────────────────────
//
// PERF FIX (2026-06):
//   Old: GET /customers?limit=500  →  full objects, profile JOIN, 20+ fields
//   New: GET /customers/lean       →  {cust_id, cust_name, cust_phone} only
//
// The backend /customers/lean endpoint:
//   - Skips ALL JOINs (no profile JOIN for last_updated_by)
//   - Returns only 3 fields per customer
//   - Uses an index-only scan (covering index)
//   - Hard limit of 1000 customers max
//
// The sales dropdown only ever uses cust_id + cust_name + cust_phone.
// All other fields would have been wasted bytes over the wire.
export const fetchCustomersForSale = async () => {
  const res = await api.get('/customers/lean')
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
//   An exact barcode scan calls GET /products/barcode/{code} directly.
//   searchProductsLean is for the dropdown search only.
export const searchProductsLean = async (q) => {
  if (!q || q.trim().length < 2) return []
  const res = await api.get('/products/search', { params: { q: q.trim(), limit: 20 } })
  // Backend returns array directly (success_response wraps array as-is)
  const data = res.data
  if (Array.isArray(data)) return data
  return []
}

// ── Exact barcode lookup for scanner input in the sales form ──────────────────
//
// PERF FIX (2026-06):
//   Backend barcode endpoint now returns a lean 8-field response
//   (no profile JOINs, no audit fields, no category JOIN).
//   Fields: prod_id, prod_name, prod_sell_price, prod_mrp,
//           tax_rate, barcode, unit, prod_stock_qty
//   These are exactly what CreateSalePage needs to add a line item.
export const fetchProductByBarcode = async (code) => {
  const res = await api.get(`/products/barcode/${encodeURIComponent(code.trim())}`)
  return res.data   // lean product row (8 fields only)
}
