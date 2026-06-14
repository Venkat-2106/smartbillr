// src/features/payments/hooks/usePayments.js
//
// Owns ALL server state + UI filter/sort/page state for the Payments page.
// Follows the exact same pattern as useCustomers.js / useSales.js.
//
// KEY DESIGN NOTE — what this page shows:
//   GET /payments returns is_active=true rows only → one row per sale.
//   Each row = current payment snapshot for a sale (invoice, customer,
//   total, paid so far, remaining, status, method, last payment date).
//   Full history for a sale is fetched separately in PaymentHistoryDrawer
//   via GET /payments/sale/{id}.
//
// DATE FILTER:
//   Filters on payment_paid_at (the date the latest payment was recorded).
//   We send UTC ISO boundaries using localDayStartUTC / localDayEndUTC,
//   same as useCustomers.js.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import { useDebounce }                            from '../../../shared/hooks/useDebounce'
import { localDayStartUTC, localDayEndUTC }       from '../../../shared/utils/dateUtils'
import {
  fetchPayments,
  fetchAllPaymentsForExport,
  fetchPaymentsBySale,
  recordPayment,
} from '../api/paymentsApi'

const PAGE_SIZE = 20

// ── usePaymentHistory (singular sale) ────────────────────────────────────────
// Used by PaymentHistoryDrawer to fetch full history + summary for one sale.
export function usePaymentHistory(saleId) {
  return useQuery({
    queryKey:  ['payment-history', saleId],
    queryFn:   () => fetchPaymentsBySale(saleId),
    enabled:   !!saleId,
    staleTime: 30_000,
  })
}

// ── usePayments (list page) ───────────────────────────────────────────────────
export function usePayments() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  // ── Filter / sort / page state ──────────────────────────────────────────
  const [search,   setSearchRaw]  = useState('')
  const [status,   setStatusRaw]  = useState('')
  const [sortKey,  setSortKey]    = useState('payment_paid_at')
  const [sortDir,  setSortDir]    = useState('desc')
  const [page,     setPage]       = useState(1)
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo,   setDateTo]     = useState('')

  const debouncedSearch = useDebounce(search, 350)

  // ── FETCH ────────────────────────────────────────────────────────────────
  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['payments', page, debouncedSearch, status, sortKey, sortDir, dateFrom, dateTo],
    queryFn:  () => fetchPayments({
      page,
      limit:     PAGE_SIZE,
      search:    debouncedSearch,
      status,
      sort_by:   sortKey,
      sort_dir:  sortDir,
      date_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
      date_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const payments   = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0
  const totalPages = pagination.total_pages ?? 1

  // ── LAZY EXPORT ──────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const rows = await fetchAllPaymentsForExport({
        search:    debouncedSearch,
        status,
        sort_by:   sortKey,
        sort_dir:  sortDir,
        date_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        date_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      })
      if (serverData?.pagination?.truncated) {
        toast('Export limited to 10,000 records.', { icon: '⚠️' })
      }
      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }

  // ── EVENT HANDLERS ───────────────────────────────────────────────────────
  function handleSearch(val) {
    setSearchRaw(val)
    setPage(1)
  }

  function handleStatus(val) {
    setStatusRaw(val)
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

  function handleDateFrom(val) { setDateFrom(val); setPage(1) }
  function handleDateTo(val)   { setDateTo(val);   setPage(1) }

  // ── RECORD PAYMENT MUTATION ───────────────────────────────────────────────
  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: (_, variables) => {
      // Invalidate both the list and the specific sale's history
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['payment-history', variables.sale_id] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      toast.success('Payment recorded successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to record payment')
    },
  })

  return {
    // Table data
    payments,
    isLoading,
    isFetching,
    isError,

    // Filters
    search,    setSearch: handleSearch,
    status,    setStatus: handleStatus,
    dateFrom,  setDateFrom: handleDateFrom,
    dateTo,    setDateTo:   handleDateTo,

    // Sort
    sortKey, sortDir, handleSort,

    // Pagination
    page, setPage, totalPages, totalItems,
    pagination,

    // Export
    handleExport,

    // Mutation
    recordPayment:   (data, callbacks) => recordMutation.mutate(data, callbacks),
    isRecording:     recordMutation.isPending,
  }
}