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
// TIMEZONE FIX:
//   The <input type="date"> gives a "YYYY-MM-DD" string in the user's LOCAL
//   calendar. If we send that bare string to the backend, PostgreSQL (UTC)
//   treats it as UTC midnight — records from IST 00:00–05:29 on that local
//   date are stored as the PREVIOUS UTC day and get excluded from the filter.
//
//   Fix: localDayStartUTC / localDayEndUTC convert the local calendar date to
//   the UTC ISO boundaries of that local day before sending to the API.
//   This mirrors the pattern already used in useSales.js.
//
// REFACTOR — useServerTableState:
//   The ~40 lines of UI-state plumbing (page / search / debounce / sort /
//   dateFrom / dateTo / handlers) have been replaced by a single call to
//   useServerTableState() from shared/hooks/useServerTableState.js.
//   The public return shape of this hook is UNCHANGED — CustomersPage.jsx
//   does not need any modifications.
//
// ARCHITECTURE UNCHANGED:
//   - Server data via React Query (never fetch in component)
//   - No direct localStorage (Zustand persist handles it)
//   - authStore not imported in the API file

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { localDayStartUTC, localDayEndUTC }  from '../../../shared/utils/dateUtils'
import { useServerTableState }               from '../../../shared/hooks/useServerTableState'
const PAGE_SIZE = 20


// ── useCustomer (singular) ───────────────────────────────────────────────────
// Fetches one customer's full detail (summary + paginated sales history).
// page/limit control which page of sales_history is returned.
export function useCustomer(custId, page = 1, limit = 10) {
  return useQuery({
    queryKey: ['customer', custId, page],
    queryFn:  () => fetchCustomer(custId, { page, limit }),
    enabled:  !!custId,
    staleTime: 60 * 1000,
  })
}


// ── useCustomers (plural) ────────────────────────────────────────────────────
export function useCustomers() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  // ── UI state (page / search / sort / dates) ─────────────────────────────
  // Replaces ~40 lines of useState + useDebounce + handler boilerplate.
  // initialSortKey/Dir match the previous useState defaults exactly.
  // Public names returned here are identical to what CustomersPage.jsx expects.
  const {
    page,   setPage,
    search, debouncedSearch, setSearch,
    sortKey, sortDir, handleSort,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    unwrapPagination,
  } = useServerTableState({
    initialSortKey: 'updated_at',
    initialSortDir: 'desc',
    debounceMs:     350,
  })

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
      // TIMEZONE FIX: send UTC ISO boundaries of the user's local day
      updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
      updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,   // keep old rows visible while new page loads
    enabled:         !!user,
  })

  // ── Unwrap pagination envelope ───────────────────────────────────────────
  const { items: customers, pagination, totalItems, totalPages } = unwrapPagination(serverData)

  // ── LAZY EXPORT ──────────────────────────────────────────────────────────
  // Only runs when the Export button is clicked.
  // Sends the same active filters to the backend → gets all matching rows.
  async function handleExport() {
    try {
      const rows = await fetchAllCustomersForExport({
        search:       debouncedSearch,
        sort_by:      sortKey,
        sort_dir:     sortDir,
        // TIMEZONE FIX: same UTC boundary conversion as the query
        updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
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
    isLoading,
    isFetching,
    isError,

    // Search (setSearch from useServerTableState resets page automatically)
    search,
    setSearch,

    // Date range (setDateFrom/setDateTo from useServerTableState reset page)
    dateFrom,  setDateFrom,
    dateTo,    setDateTo,

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