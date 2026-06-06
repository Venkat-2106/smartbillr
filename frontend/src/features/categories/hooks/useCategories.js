// src/features/categories/hooks/useCategories.js
//
// EXPORT FIX — 2026-06-06
// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM:
//   allQuery fetched limit=100 in background on every page load. Businesses
//   with > 100 categories exported a truncated CSV silently.
//
// FIX:
//   1. allQuery is kept at limit=100 only for the live search filter in the
//      table (search is an infrequent action — 100 categories is a safe upper
//      bound for a dropdown / search result).
//   2. handleExport() fetches limit=10000 lazily, only when Export is clicked.
//   3. CategoriesPage.jsx passes handleExport to <ExportButton onFetch={...} />.
//
// NOTE: If your business has > 100 categories and uses search, the table search
// will show a maximum of 100 results. Move search to server-side if this becomes
// a limitation (follow the Sales page pattern).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  fetchCategories,
  fetchAllCategoriesForExport,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categoriesApi'

const KEYS = {
  all:    ['categories'],
  list:   (page) => ['categories', 'list', page],
  full:   ['categories', 'all'],
}

export function useCategories() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')

  const isSearching = search.trim().length > 0

  // Normal paginated query — used only when no filters are active
  const pagedQuery = useQuery({
    queryKey: KEYS.list(page),
    queryFn:  () => fetchCategories({ page, limit: 20 }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  // Full dataset query — limit=100 for the live search filter in the table
  // (NOT used for export — see handleExport below)
  const allQuery = useQuery({
    queryKey: KEYS.full,
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 30_000,
  })

  const isFiltering = isSearching
  const activeQuery = isFiltering ? allQuery : pagedQuery
  const allItems    = allQuery.data?.items ?? []
  const pagedItems  = pagedQuery.data?.items ?? []

  const filtered = isSearching
    ? allItems.filter(c =>
        c.category_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : pagedItems

  // ── Lazy export — fetches all categories on demand (limit=10000) ─────────
  async function handleExport({ dateFrom = '', dateTo = '' } = {}) {
    try {
      let rows = await fetchAllCategoriesForExport()

      // Apply search filter (same as table)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        rows = rows.filter(c => c.category_name.toLowerCase().includes(q))
      }

      // Apply date range filter on updated_at
      if (dateFrom) {
        const from = new Date(dateFrom); from.setHours(0, 0, 0, 0)
        rows = rows.filter(r => r.updated_at && new Date(r.updated_at) >= from)
      }
      if (dateTo) {
        const to = new Date(dateTo); to.setHours(23, 59, 59, 999)
        rows = rows.filter(r => r.updated_at && new Date(r.updated_at) <= to)
      }

      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }

  return {
    categories: filtered,
    allCategories: allItems,   // kept for CategoriesPage date-filter display logic
    pagination: isFiltering ? null : (pagedQuery.data?.pagination ?? null),
    page,
    setPage,
    search,
    setSearch,
    isLoading:  activeQuery.isLoading,
    isError:    activeQuery.isError,
    handleExport,
  }
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Category created')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create category')
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Category updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update category')
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      const n = data?.products_deactivated ?? 0
      if (n > 0) {
        toast.success(`Category deleted · ${n} product${n > 1 ? 's' : ''} also deactivated`)
      } else {
        toast.success('Category deleted')
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete category')
    },
  })
}
