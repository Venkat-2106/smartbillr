// src/features/categories/hooks/useCategories.js
//
// FIX: Date filter now always uses the allQuery (full dataset, limit=100).
// Before: date filter was applied in useMemo on top of pagedQuery (20 items)
// which meant it only filtered the current page — missing records on other pages.
// Now: allQuery is always pre-fetched in the background. The page switches to
// allQuery whenever either search OR date filter is active.

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
    keepPreviousData: true,
    staleTime: 30_000,
  })

  // Full dataset query — used for search AND date filter
  // Pre-fetched in background so it's ready when user starts filtering
  const allQuery = useQuery({
    queryKey: KEYS.full,
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 30_000,
  })

  // Switch to full dataset whenever any filter is active
  const isFiltering = isSearching
  const activeQuery = isFiltering ? allQuery : pagedQuery
  const allItems    = allQuery.data?.items ?? []
  const pagedItems  = pagedQuery.data?.items ?? []

  // Search filters on the full dataset always
  const filtered = isSearching
    ? allItems.filter(c =>
        c.category_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : pagedItems

  return {
    categories: filtered,
    allCategories: allItems,          // exposed so page can apply date filter on full set
    pagination: isFiltering ? null : (pagedQuery.data?.pagination ?? null),
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