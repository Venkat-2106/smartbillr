// src/features/products/hooks/useProducts.js
//
// FIX: Changed limit=500 → limit=100 (matches paginate() le=100 cap).
// Client-side filter on prod_name AND category_name — category search works
// because the backend joins category_name into every product row already.
// Note: backend also now supports ?search= for name/barcode (from last session),
// but category_name filter must stay client-side since backend only searches
// name and barcode, not category_name. So we keep the dual-query pattern
// but with limit=100 which is safe.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../api/productsApi'

const KEYS = {
  all:    ['products'],
  list:   (page) => ['products', 'list', page],
  search: ['products', 'all'],
}

export function useProducts() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')

  const isSearching = search.trim().length > 0

  // Normal paginated query (used when NOT searching)
  const pagedQuery = useQuery({
    queryKey: KEYS.list(page),
    queryFn:  () => fetchProducts({ page, limit: 20 }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    enabled:  !isSearching,
  })

  // Full-dataset query — always pre-fetched in background (same as useCategories pattern).
  // Used for search filtering AND for CSV export (so export always gets all records,
  // not just the 20 items currently visible on the paged table).
  const allQuery = useQuery({
    queryKey: KEYS.search,
    queryFn:  () => fetchProducts({ page: 1, limit: 100 }),
    staleTime: 30_000,
    // No 'enabled' condition — always fetch so export data is always available
  })

  const activeQuery = isSearching ? allQuery : pagedQuery
  const allItems    = activeQuery.data?.items ?? []

  // Client-side filter: matches prod_name OR category_name
  const filtered = isSearching
    ? allItems.filter(p => {
        const q = search.trim().toLowerCase()
        return (
          p.prod_name?.toLowerCase().includes(q) ||
          p.category_name?.toLowerCase().includes(q)
        )
      })
    : allItems

  return {
    products:    filtered,
    allProducts: allQuery.data?.items ?? [],   // full unfiltered set — used by page for export
    pagination:  isSearching ? null : (pagedQuery.data?.pagination ?? null),
    page,
    setPage,
    search,
    setSearch,
    isLoading:  activeQuery.isLoading,
    isError:    activeQuery.isError,
  }
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product created')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create product')
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => updateProduct(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update product')
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete product')
    },
  })
}