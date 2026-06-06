// src/features/products/api/productsApi.js
//
// EXPORT FIX — 2026-06-06
// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM:
//   The allQuery in useProducts.js fetched limit=100. When a business has
//   more than 100 products, the exported CSV only contained the first 100.
//   The backend's paginate() helper now accepts up to le=10000, so we can
//   request all records in a single call.
//
// FIX:
//   Added fetchAllProductsForExport({ search, category }) — a dedicated
//   function that requests limit=10000 and returns the flat items array.
//   useProducts.js calls this lazily (only when Export button is clicked),
//   so we avoid fetching 10 000 rows on every page load.
//
//   The regular fetchProducts() is unchanged — still paginated (limit=20)
//   for the table view.
// ─────────────────────────────────────────────────────────────────────────────

import api from '../../../api/axios'

// ── Paginated list (used by the table — NOT for export) ──────────────────────
export async function fetchProducts({ page = 1, limit = 20, search = '' } = {}) {
  const params = { page, limit }
  if (search && search.trim()) params.search = search.trim()
  const res = await api.get('/products/', { params })
  return res.data
}

// ── Export: fetch ALL matching products in one call ──────────────────────────
// Called only when the user clicks "Export CSV". Passes the same active
// search term so the exported file matches exactly what is on screen.
//
// NOTE: category_name filtering is client-side (backend search only covers
// prod_name and barcode). This function therefore fetches ALL products
// matching the name/barcode search (or all if no search), then the hook
// applies the category_name filter client-side before writing the CSV.
//
// limit=10000 — backend paginate() le cap was raised to 10000 in this fix.
export async function fetchAllProductsForExport({ search = '' } = {}) {
  const params = { page: 1, limit: 10000 }
  if (search && search.trim()) params.search = search.trim()
  const res = await api.get('/products/', { params })
  return res.data?.items ?? []
}

export async function fetchProduct(prodId) {
  const res = await api.get(`/products/${prodId}`)
  return res.data
}

export async function createProduct(payload) {
  const res = await api.post('/products/', payload)
  return res.data
}

export async function updateProduct(prodId, payload) {
  const res = await api.put(`/products/${prodId}`, payload)
  return res.data
}

export async function deleteProduct(prodId) {
  const res = await api.delete(`/products/${prodId}`)
  return res.data
}
