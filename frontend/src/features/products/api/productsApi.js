// src/features/products/api/productsApi.js
//
// SCALABILITY FIX — added server-side sort, date-range, and export params.
//
// BEFORE:
//   fetchProducts() only sent { page, limit, search } to the backend.
//   ProductsPage managed sortKey/sortDir/dateFrom/dateTo locally.
//   The page switched to allProducts (limit=10000) for date filter and sorting,
//   running those operations in JavaScript on the full dataset.
//   allQuery fired on EVERY page load whether searching or not.
//
// AFTER:
//   fetchProducts() now forwards sort_by, sort_dir, updated_from, updated_to
//   to the backend. When NOT searching, the paged query gets correctly sorted
//   and date-filtered rows from PostgreSQL — no full-dataset fetch needed.
//
//   fetchAllProductsForExport() is lazy — only called on export click.
//   It sends the same active filters with limit=10000.
//
// BARCODE + EXISTING FUNCTIONS UNCHANGED:
//   checkBarcode(), fetchProductByBarcode(), createProduct(), updateProduct(),
//   deleteProduct() are identical — no behaviour changes.

import api from '../../../api/axios'

// ── Paginated list (table view) — server-side filter/sort/paginate ─────────────
export async function fetchProducts({
  page         = 1,
  limit        = 20,
  search       = '',
  sort_by      = 'prod_name',
  sort_dir     = 'asc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page, limit }
  if (search && search.trim())  params.search       = search.trim()
  if (sort_by)                  params.sort_by      = sort_by
  if (sort_dir)                 params.sort_dir     = sort_dir
  if (updated_from)             params.updated_from = updated_from
  if (updated_to)               params.updated_to   = updated_to

  const res = await api.get('/products/', { params })
  return res.data
}

// ── Lazy export — fetches ALL matching rows only when export is clicked ────────
// Sends the same active filter params with limit=10000.
// Returns a flat array of records (not the pagination envelope).
export async function fetchAllProductsForExport({
  search       = '',
  sort_by      = 'prod_name',
  sort_dir     = 'asc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search && search.trim())  params.search       = search.trim()
  if (sort_by)                  params.sort_by      = sort_by
  if (sort_dir)                 params.sort_dir     = sort_dir
  if (updated_from)             params.updated_from = updated_from
  if (updated_to)               params.updated_to   = updated_to

  const res = await api.get('/products/', { params })
  return res.data?.items ?? []
}

// ── Single product by ID ──────────────────────────────────────────────────────
export async function fetchProduct(prodId) {
  const res = await api.get(`/products/${prodId}`)
  return res.data
}

// ── Exact barcode lookup (BARCODE FIX — unchanged) ────────────────────────────
// NOTE: same endpoint as fetchProductByBarcode in features/sales/api/salesApi.js
// but a DIFFERENT contract: this version swallows 404 → returns null (used by
// checkBarcode()'s boolean duplicate test); the sales version lets 404 throw so
// the scanner UI can show "not found". Don't unify them blindly.
export async function fetchProductByBarcode(code) {
  try {
    const res = await api.get(`/products/barcode/${encodeURIComponent(code.trim())}`)
    return res.data
  } catch (err) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

// ── Barcode uniqueness check (BARCODE FIX — unchanged) ────────────────────────
export async function checkBarcode(barcode, excludeProdId = null) {
  if (!barcode || !barcode.trim()) return false
  const product = await fetchProductByBarcode(barcode.trim())
  if (!product) return false
  if (excludeProdId && product.prod_id === excludeProdId) return false
  return true
}

// ── Create product ────────────────────────────────────────────────────────────
export async function createProduct(payload) {
  const res = await api.post('/products/', payload)
  return res.data
}

// ── Update product ────────────────────────────────────────────────────────────
export async function updateProduct(prodId, payload) {
  const res = await api.put(`/products/${prodId}`, payload)
  return res.data
}

// ── Delete product (soft) ─────────────────────────────────────────────────────
export async function deleteProduct(prodId) {
  const res = await api.delete(`/products/${prodId}`)
  return res.data
}
// ---- Product summary (KPI cards) ------------------------------------------------------
export async function fetchProductSummary() {
  const res = await api.get('/products/summary')
  return res.data
}
