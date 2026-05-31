// src/features/categories/api/categoriesApi.js
//
// All HTTP calls for the Categories feature.
// Every function returns the raw axios response data.
// Hooks (useCateories.js) call these — never call from a component directly.
//
// Backend endpoints (from routers/category.py):
//   GET    /categories/             → paginated list  (permission: products.view)
//   GET    /categories/{id}         → detail + products inside
//   POST   /categories/             → create          (permission: products.edit)
//   PUT    /categories/{id}         → update name     (permission: products.edit)
//   DELETE /categories/{id}         → soft delete     (permission: products.edit)

import api from '../../../api/axios'

// ── List (paginated) ─────────────────────────────────────────────────────────
// Returns: { items: [...], pagination: { total, page, limit, total_pages } }
export async function fetchCategories({ page = 1, limit = 20 } = {}) {
  const res = await api.get('/categories/', { params: { page, limit } })
  // Backend wraps in { success: true, data: { items, pagination } }
  return res.data
}

// ── Single category (detail + products list) ─────────────────────────────────
export async function fetchCategory(categoryId) {
  const res = await api.get(`/categories/${categoryId}/`)
  return res.data
}

// ── Create ───────────────────────────────────────────────────────────────────
// payload: { category_name: string }
export async function createCategory(payload) {
  const res = await api.post('/categories/', payload)
  return res.data
}

// ── Update ───────────────────────────────────────────────────────────────────
// payload: { category_name: string }
export async function updateCategory(categoryId, payload) {
  const res = await api.put(`/categories/${categoryId}/`, payload)
  return res.data
}

// ── Delete (soft) ────────────────────────────────────────────────────────────
// Returns: { message, products_deactivated: number }
export async function deleteCategory(categoryId) {
  const res = await api.delete(`/categories/${categoryId}/`)
  return res.data
}