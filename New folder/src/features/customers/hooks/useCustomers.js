// features/customers/hooks/useCustomers.js
//
// All data logic for the Customers feature.
//
// WHAT THIS HOOK DOES:
//   1. Fetches all customers with React Query (5-min stale cache)
//   2. Filters by search term (name, phone, email, tax number) — client-side
//   3. Filters by date range (cust_created_at) — client-side
//   4. Sorts by any column — client-side
//   5. Paginates the result — client-side (15 per page)
//   6. Exposes create / update / delete mutations with toast feedback
//
// FIX (Bug 2): Added useCustomer() export — fetches a single customer's
//   full detail (summary + sales history) for the detail drawer.
//
// WHY client-side filter/sort/paginate:
//   Customers table already has trigram GIN indexes for server-side search.
//   But for a beginner-manageable codebase, and since most businesses will have
//   fewer than 500 customers, client-side is simpler and still fast.
//   (When your customer count grows past 1000, move search to server-side.)
//
// ARCHITECTURE RULES FOLLOWED:
//   - Server data only via React Query (never fetch in component)
//   - No direct localStorage access (Zustand persist handles it)
//   - authStore not imported in the API file — only here in the hook

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo }                      from 'react'
import toast                                       from 'react-hot-toast'
import useAuthStore from '../../../store/authStore'
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../api/customersApi'
import { useDebounce } from '../../../shared/hooks/useDebounce'

// Number of rows shown per page in the table
const PAGE_SIZE = 15


// ── useCustomer (singular) ───────────────────────────────────────────────────
// FIX (Bug 2): This hook was missing — CustomerDetailDrawer imports it.
// Fetches a single customer's full detail including summary and sales history.
// Only fires when custId is provided (drawer is open).
// staleTime: 60 seconds — detail data changes less often than the list.

export function useCustomer(custId) {
  return useQuery({
    queryKey: ['customer', custId],
    queryFn:  () => fetchCustomer(custId),
    enabled:  !!custId,
    staleTime: 60 * 1000,   // 60 seconds
  })
}


// ── useCustomers (plural) ────────────────────────────────────────────────────
// Used by CustomersPage for the full list with filter/sort/paginate.

export function useCustomers() {
  const user        = useAuthStore(s => s.user)   // used to enable/disable the query
  const queryClient = useQueryClient()

  // ── UI state (filters, sort, pagination) ──────────────────────────────
  const [search,   setSearchRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('updated_at')
  const [sortDir,  setSortDir]   = useState('desc')
  const [page,     setPage]      = useState(1)
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  // Wait 300ms after the user stops typing before filtering
  // (prevents filtering on every keypress which flickers the table)
  const debouncedSearch = useDebounce(search, 300)


  // ── FETCH (React Query) ─────────────────────────────────────────────────
  // queryKey: ['customers'] — invalidated after any create/update/delete
  // staleTime: 5 minutes — don't refetch if data is recent
  // enabled: only fetch when user is logged in
  const {
    data:    allCustomers = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['customers'],
    queryFn:  fetchCustomers,
    staleTime: 5 * 60 * 1000,   // 5 minutes
    enabled:  !!user,
  })


  // ── FILTER + SORT (client-side, runs on every relevant state change) ────
  //
  // useMemo means this recalculates ONLY when one of the dependencies changes.
  // It does NOT run on every render — React is smart about this.
  //
  // Search covers: name, phone, email, tax number
  // Date filter covers: updated_at (the "Last Updated" column)
  //
  const filtered = useMemo(() => {
    let list = [...allCustomers]

    // ── Search filter ────────────────────────────────────────────────────
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(c =>
        c.cust_name?.toLowerCase().includes(q)        ||
        c.cust_phone?.toLowerCase().includes(q)       ||
        c.cust_email?.toLowerCase().includes(q)       ||
        c.cust_tax_number?.toLowerCase().includes(q)
      )
    }

    // ── Date range filter ────────────────────────────────────────────────
    // Compare ISO date strings — works because YYYY-MM-DD sorts lexicographically
    if (dateFrom) {
      list = list.filter(c =>
        c.updated_at && c.updated_at >= dateFrom
      )
    }
    if (dateTo) {
      list = list.filter(c =>
        c.updated_at && c.updated_at <= dateTo + 'T23:59:59'
      )
    }

    // ── Sort ─────────────────────────────────────────────────────────────
    // localeCompare with numeric: true handles both text and number fields correctly
    list.sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const cmp  = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [allCustomers, debouncedSearch, sortKey, sortDir, dateFrom, dateTo])


  // ── PAGINATION ──────────────────────────────────────────────────────────
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)


  // ── EVENT HANDLERS ──────────────────────────────────────────────────────
  // Always reset to page 1 when search or sort changes (avoids empty pages)

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


  // ── MUTATIONS ───────────────────────────────────────────────────────────
  // After every mutation → invalidate the ['customers'] query key.
  // This tells React Query: "that cache is now stale, refetch it."
  // The table will automatically update with the new data.

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer added successfully')
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to add customer'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated successfully')
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to update customer'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer removed')
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to remove customer'
      toast.error(msg)
    },
  })


  // ── RETURN ──────────────────────────────────────────────────────────────
  return {
    // Table data (current page only)
    customers: paginated,

    // Export data (ALL filtered records — not just current page)
    exportData: filtered,

    // Loading / error states
    isLoading,
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

    // Pagination (passed to Pagination.jsx)
    page,
    setPage,
    totalPages,
    totalItems,

    // Mutations — called from the page with (data) or ({ id, data })
    createCustomer: (data, callbacks) => createMutation.mutate(data, callbacks),
    updateCustomer: (id, data, callbacks) => updateMutation.mutate({ id, data }, callbacks),
    deleteCustomer: (id, callbacks) => deleteMutation.mutate(id, callbacks),

    // Loading flags for submit buttons (show spinner while saving)
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}