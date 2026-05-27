// src/features/categories/hooks/useCategories.js
//
// FIX: Changed limit=500 → limit=100 (matches paginate() le=100 cap).
// Categories are typically small (<50 per business) so limit=100 covers all.
// Search remains client-side since the backend has no search param for categories.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categoriesApi'

const KEYS = {
  all:    ['categories'],
  list:   (page) => ['categories', 'list', page],
  search: ['categories', 'all'],
}

export function useCategories() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')

  const isSearching = search.trim().length > 0

  // Normal paginated query (used when NOT searching)
  const pagedQuery = useQuery({
    queryKey: KEYS.list(page),
    queryFn:  () => fetchCategories({ page, limit: 20 }),
    keepPreviousData: true,
    staleTime: 30_000,
    enabled:  !isSearching,
  })

  // Full-dataset query for search — limit=100 (backend max, categories are small)
  const allQuery = useQuery({
    queryKey: KEYS.search,
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 30_000,
    enabled:  isSearching,
  })

  const activeQuery = isSearching ? allQuery : pagedQuery
  const allItems    = activeQuery.data?.items ?? []

  const filtered = isSearching
    ? allItems.filter(c =>
        c.category_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allItems

  return {
    categories: filtered,
    pagination: isSearching ? null : (pagedQuery.data?.pagination ?? null),
    page,
    setPage,
    search,
    setSearch,
    isLoading:  activeQuery.isLoading,
    isError:    activeQuery.isError,
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
