// src/features/categories/api/categoriesApi.js
//
// EXPORT FIX — 2026-06-06
// Added fetchAllCategoriesForExport() — limit=10000, used only on export click.
// fetchCategories() is unchanged (paginated, for the table).

import api from '../../../api/axios'

// ── Paginated list (table view) ──────────────────────────────────────────────
export async function fetchCategories({ page = 1, limit = 20 } = {}) {
  const res = await api.get('/categories/', { params: { page, limit } })
  return res.data
}

// ── Export: all categories in one call ──────────────────────────────────────
// limit=10000 — backend paginate() le cap raised to 10000 in this fix.
export async function fetchAllCategoriesForExport() {
  const res = await api.get('/categories/', { params: { page: 1, limit: 10000 } })
  return res.data?.items ?? []
}

export async function fetchCategory(categoryId) {
  const res = await api.get(`/categories/${categoryId}/`)
  return res.data
}

export async function createCategory(payload) {
  const res = await api.post('/categories/', payload)
  return res.data
}

export async function updateCategory(categoryId, payload) {
  const res = await api.put(`/categories/${categoryId}/`, payload)
  return res.data
}

export async function deleteCategory(categoryId) {
  const res = await api.delete(`/categories/${categoryId}/`)
  return res.data
}
