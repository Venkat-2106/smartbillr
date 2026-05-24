// src/features/categories/hooks/useCategories.js

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categoriesApi'

// ── Query key factory ────────────────────────────────────────────────────────
const KEYS = {
  all:  ['categories'],
  list: (page) => ['categories', 'list', page],
}

// ── List hook ────────────────────────────────────────────────────────────────
// Fetches paginated categories from the server.
// Filters client-side by search string (backend has no search param).
export function useCategories() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')

  const query = useQuery({
    queryKey: KEYS.list(page),
    queryFn:  () => fetchCategories({ page, limit: 20 }),
    keepPreviousData: true,
    staleTime: 30_000,
  })

  // Client-side filter by category_name (case-insensitive)
  const allItems = query.data?.items ?? []
  const filtered = search.trim()
    ? allItems.filter(c =>
        c.category_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allItems

  return {
    categories: filtered,
    // Hide pagination while searching — filtered results are already all visible
    pagination:  search.trim() ? null : (query.data?.pagination ?? null),
    page,
    setPage,
    search,
    setSearch,
    isLoading:   query.isLoading,
    isError:     query.isError,
  }
}

// ── Create mutation ──────────────────────────────────────────────────────────
export function useCreateCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Category created')
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Could not create category'
      toast.error(msg)
    },
  })
}

// ── Update mutation ──────────────────────────────────────────────────────────
export function useUpdateCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Category updated')
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Could not update category'
      toast.error(msg)
    },
  })
}

// ── Delete mutation ──────────────────────────────────────────────────────────
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
      const msg = err?.response?.data?.message || 'Could not delete category'
      toast.error(msg)
    },
  })
}