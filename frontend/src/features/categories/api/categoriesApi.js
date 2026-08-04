// src/features/categories/api/categoriesApi.js
//
// SCALABILITY FIX — added server-side filter params.
//
// BEFORE:
//   fetchCategories() accepted only { page, limit } — no search, no sort, no date.
//   The hook kept a separate allQuery (limit=100) and filtered in JavaScript.
//   Businesses with > 100 categories got silently truncated search results.
//
// AFTER:
//   fetchCategories() now forwards search, sort_by, sort_dir, updated_from,
//   updated_to to the backend. PostgreSQL does the work before any row leaves
//   the database. The 100-category search cap is completely eliminated.
//
//   fetchAllCategoriesForExport() sends the SAME filter params with limit=10000
//   so the CSV always contains all records that match the active filters.

import api from '../../../api/axios'
import { getTzOffsetMinutes } from '../../../shared/utils/dateUtils'

// ── Paginated list (table view) — server-side filter/sort/paginate ────────────
export async function fetchCategories({
  page         = 1,
  limit        = 20,
  search       = '',
  sort_by      = 'category_name',
  sort_dir     = 'asc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())  params.search       = search.trim()
  if (sort_by)        params.sort_by      = sort_by
  if (sort_dir)       params.sort_dir     = sort_dir
  if (updated_from)   params.updated_from = updated_from
  if (updated_to)     params.updated_to   = updated_to

  const res = await api.get('/categories/', { params })
  return res.data   // { items: [...], pagination: { total, page, ... } }
}

// ── Lazy export — fetches all matching categories on demand ───────────────────
// Sends the same active filter params with limit=10000.
// Returns a flat array (not the pagination envelope).
export async function fetchAllCategoriesForExport({
  search       = '',
  sort_by      = 'category_name',
  sort_dir     = 'asc',
  updated_from = '',
  updated_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())  params.search       = search.trim()
  if (sort_by)        params.sort_by      = sort_by
  if (sort_dir)       params.sort_dir     = sort_dir
  if (updated_from)   params.updated_from = updated_from
  if (updated_to)     params.updated_to   = updated_to

  const res = await api.get('/categories/', { params })
  return res.data?.items ?? []
}

// ── Single category detail ────────────────────────────────────────────────────
export async function fetchCategory(categoryId) {
  const res = await api.get(`/categories/${categoryId}/`)
  return res.data
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createCategory(payload) {
  const res = await api.post('/categories/', payload)
  return res.data
}

// ── Update ────────────────────────────────────────────────────────────────────
export async function updateCategory(categoryId, payload) {
  const res = await api.put(`/categories/${categoryId}/`, payload)
  return res.data
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────
export async function deleteCategory(categoryId) {
  const res = await api.delete(`/categories/${categoryId}/`)
  return res.data
}

// ── Category summary (KPI cards) ──────────────────────────────────────────────
export async function fetchCategorySummary() {
  const res = await api.get('/categories/summary', { params: { tz_offset_minutes: getTzOffsetMinutes() } })
  return res.data
}