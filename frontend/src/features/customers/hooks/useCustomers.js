// src/features/customers/hooks/useCustomers.js
//
// OPTIMIZED:
//   - Single query architecture — no dual-query (paged + all) pattern
//   - search is sent to the backend via the `search` param
//   - debounced search → avoids a request on every keystroke
//   - query key includes search + page so React Query caches properly per search term
//   - No client-side filtering (server handles it)
//   - Targeted invalidation: only invalidates ['customers','list'] not entire tree

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import toast from 'react-hot-toast'
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../api/customersApi'

// ── Query key factory ────────────────────────────────────────────────────────
// Keys include search + page so each unique search result is cached independently.
const KEYS = {
  all:    ['customers'],
  list:   (page, search) => ['customers', 'list', page, search],
  detail: (id)           => ['customers', 'detail', id],
}

// ── List hook ────────────────────────────────────────────────────────────────
export function useCustomers() {
  const [page,   setPage]   = useState(1)
  const [search, setSearch] = useState('')

  // Debounce: wait 350ms after user stops typing before sending request
  // This prevents a request on EVERY keystroke — big improvement for search UX
  const debouncedSearch = useDebounce(search, 350)

  // Reset to page 1 whenever search changes
  const handleSearch = useCallback((val) => {
    setSearch(val)
    setPage(1)
  }, [])

  const query = useQuery({
    queryKey: KEYS.list(page, debouncedSearch),
    queryFn:  () => fetchCustomers({ page, limit: 20, search: debouncedSearch }),
    keepPreviousData: true,   // keeps old data visible while new page loads (no flash)
    staleTime: 30_000,        // 30s — list doesn't need to refetch on every focus
  })

  return {
    customers:  query.data?.items       ?? [],
    pagination: query.data?.pagination  ?? null,
    page,
    setPage,
    search,
    setSearch: handleSearch,
    isLoading:  query.isLoading,
    isError:    query.isError,
    isFetching: query.isFetching,      // useful for showing subtle refresh indicator
  }
}

// ── Single customer detail hook ───────────────────────────────────────────────
export function useCustomer(custId) {
  return useQuery({
    queryKey: KEYS.detail(custId),
    queryFn:  () => fetchCustomer(custId),
    staleTime: 30_000,
    enabled:  Boolean(custId),
  })
}

// ── Create mutation ──────────────────────────────────────────────────────────
export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      // Invalidate list only — detail cache is unaffected
      qc.invalidateQueries({ queryKey: ['customers', 'list'] })
      toast.success('Customer added')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create customer')
    },
  })
}

// ── Update mutation ──────────────────────────────────────────────────────────
export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => updateCustomer(id, payload),
    onSuccess: (_data, { id }) => {
      // Invalidate list + the specific detail cache for this customer
      qc.invalidateQueries({ queryKey: ['customers', 'list'] })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
      toast.success('Customer updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update customer')
    },
  })
}

// ── Delete mutation ──────────────────────────────────────────────────────────
export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', 'list'] })
      toast.success('Customer deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete customer')
    },
  })
}
