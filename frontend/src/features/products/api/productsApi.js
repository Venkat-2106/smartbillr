// src/features/products/api/productsApi.js
//
// BARCODE FIX (2026-06-06):
//   Added two new functions:
//   1. checkBarcode(barcode, excludeProdId) — validates uniqueness before save
//   2. fetchProductByBarcode(code) — exact barcode lookup (used by scanner)
//
//   All existing functions unchanged.

import api from '../../../api/axios'

// ── Paginated list (table view) ───────────────────────────────────────────────
export async function fetchProducts({ page = 1, limit = 20, search = '' } = {}) {
  const params = { page, limit }
  if (search && search.trim()) params.search = search.trim()
  const res = await api.get('/products/', { params })
  return res.data
}

// ── Single product by ID ──────────────────────────────────────────────────────
export async function fetchProduct(prodId) {
  const res = await api.get(`/products/${prodId}`)
  return res.data
}

// ── Exact barcode lookup (BARCODE FIX) ────────────────────────────────────────
// Calls GET /products/barcode/{code}.
// Returns the matching product object, or null if not found (404).
// Used by:
//   - CreateSalePage barcode scanner (already calls this)
//   - ProductsPage barcode field real-time duplicate check
// Throws on any error other than 404 so the caller can handle network errors.
export async function fetchProductByBarcode(code) {
  try {
    const res = await api.get(`/products/barcode/${encodeURIComponent(code.trim())}`)
    return res.data   // product object
  } catch (err) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

// ── Barcode uniqueness check (BARCODE FIX) ────────────────────────────────────
// Returns true if the barcode is already taken by another product in this business.
// excludeProdId: pass the current product's prod_id when editing so a product
//               is not flagged as a duplicate of itself.
//
// HOW IT WORKS:
//   Calls fetchProductByBarcode() — if a product comes back and its prod_id
//   is different from excludeProdId, the barcode is taken.
//
// Called from the barcode field's onBlur in AddProductForm / EditProductForm.
// We do NOT call this on every keystroke — only when the user leaves the field.
export async function checkBarcode(barcode, excludeProdId = null) {
  if (!barcode || !barcode.trim()) return false   // empty barcode — always OK
  const product = await fetchProductByBarcode(barcode.trim())
  if (!product) return false                       // not found — barcode is free
  if (excludeProdId && product.prod_id === excludeProdId) return false  // own product
  return true                                      // taken by a different product
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
