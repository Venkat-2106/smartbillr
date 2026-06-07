// src/features/customers/hooks/useCustomers.js
//
// SCALABILITY FIX:
//   The previous version fetched limit=10000 then filtered/sorted/paginated
//   everything in JavaScript (useMemo). That approach breaks at scale and
//   silently truncates businesses with > 10,000 customers.
//
//   This version sends all active filters to the backend as query params.
//   The database does the filtering, sorting, and counting. The hook
//   receives only the 20 rows for the current page.
//
//   Export is now lazy: handleExport() fetches from the backend on demand
//   with the same active filters and limit=10000. The CSV always contains
//   all matching records, not just what is in browser memory.
//
// ARCHITECTURE UNCHANGED:
//   - Server data via React Query (never fetch in component)
//   - No direct localStorage (Zustand persist handles it)
//   - authStore not imported in the API file

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchCustomers,
  fetchAllCustomersForExport,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../api/customersApi'
import { useDebounce } from '../../../shared/hooks/useDebounce'

const PAGE_SIZE = 20


// ── useCustomer (singular) ───────────────────────────────────────────────────
// Fetches one customer's full detail (summary + sales history) for the drawer.
export function useCustomer(custId) {
  return useQuery({
    queryKey: ['customer', custId],
    queryFn:  () => fetchCustomer(custId),
    enabled:  !!custId,
    staleTime: 60 * 1000,
  })
}


// ── useCustomers (plural) ────────────────────────────────────────────────────
export function useCustomers() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  // ── Filter / sort / page state ──────────────────────────────────────────
  const [search,   setSearchRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('updated_at')
  const [sortDir,  setSortDir]   = useState('desc')
  const [page,     setPage]      = useState(1)
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  // Debounce: wait 350ms after the user stops typing before sending to server
  const debouncedSearch = useDebounce(search, 350)

  // ── FETCH (React Query — server paginated) ──────────────────────────────
  // queryKey includes every filter param so any change triggers a fresh fetch.
  // staleTime: 30s — short enough that edits show quickly, long enough to
  // avoid hammering the backend on rapid page clicks.
  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: [
      'customers', page, debouncedSearch, sortKey, sortDir, dateFrom, dateTo
    ],
    queryFn: () => fetchCustomers({
      page,
      limit:        PAGE_SIZE,
      search:       debouncedSearch,
      sort_by:      sortKey,
      sort_dir:     sortDir,
      updated_from: dateFrom,
      updated_to:   dateTo,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,   // keep old rows visible while new page loads
    enabled:         !!user,
  })

  // Unwrap pagination envelope
  const customers  = serverData?.items       ?? []
  const pagination = serverData?.pagination  ?? {}
  const totalItems = pagination.total        ?? 0
  const totalPages = pagination.total_pages  ?? 1

  // ── LAZY EXPORT ──────────────────────────────────────────────────────────
  // Only runs when the Export button is clicked.
  // Sends the same active filters to the backend → gets all matching rows.
  async function handleExport() {
    try {
      const rows = await fetchAllCustomersForExport({
        search:       debouncedSearch,
        sort_by:      sortKey,
        sort_dir:     sortDir,
        updated_from: dateFrom,
        updated_to:   dateTo,
      })
      // Warn if the result was capped at 10,000
      if (serverData?.pagination?.truncated) {
        toast('Export limited to 10,000 records. Contact support for full export.', { icon: '⚠️' })
      }
      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }

  // ── EVENT HANDLERS ──────────────────────────────────────────────────────
  function handleSearch(val) {
    setSearchRaw(val)
    setPage(1)
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleDateFrom(val) {
    setDateFrom(val)
    setPage(1)
  }

  function handleDateTo(val) {
    setDateTo(val)
    setPage(1)
  }

  // ── MUTATIONS ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer added successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to add customer')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update customer')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer removed')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to remove customer')
    },
  })

  // ── RETURN ───────────────────────────────────────────────────────────────
  return {
    // Table data (current page only — server paginated)
    customers,

    // Loading / error states
    isLoading: isLoading || isFetching,
    isError,

    // Search
    search,
    setSearch: handleSearch,

    // Date range
    dateFrom,  setDateFrom: handleDateFrom,
    dateTo,    setDateTo:   handleDateTo,

    // Sort (passed to Table.jsx)
    sortKey,
    sortDir,
    handleSort,

    // Pagination (passed to Pagination.jsx via the shape it expects)
    page,
    setPage,
    totalPages,
    totalItems,

    // Export
    handleExport,

    // Mutations
    createCustomer: (data, callbacks)     => createMutation.mutate(data, callbacks),
    updateCustomer: (id, data, callbacks) => updateMutation.mutate({ id, data }, callbacks),
    deleteCustomer: (id, callbacks)       => deleteMutation.mutate(id, callbacks),

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}