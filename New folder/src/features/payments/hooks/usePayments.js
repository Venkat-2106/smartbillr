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
import { useServerTableState }                    from '../../../shared/hooks/useServerTableState'
import { localDayStartUTC, localDayEndUTC }       from '../../../shared/utils/dateUtils'
import {
  fetchPayments,
  fetchAllPaymentsForExport,
  fetchPaymentsBySale,
  recordPayment,
} from '../api/paymentsApi'

const PAGE_SIZE = 20

// ── usePaymentHistory (singular sale) ────────────────────────────────────────
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

  const tbl = useServerTableState({
    initialSortKey: 'payment_paid_at',
    initialSortDir: 'desc',
  })

  const [status, setStatusRaw] = useState('')
  function handleStatus(val) { setStatusRaw(val); tbl.setPage(1) }

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['payments', tbl.page, tbl.debouncedSearch, status, tbl.sortKey, tbl.sortDir, tbl.dateFrom, tbl.dateTo],
    queryFn:  () => fetchPayments({
      page:       tbl.page,
      limit:      PAGE_SIZE,
      search:     tbl.debouncedSearch,
      status,
      sort_by:    tbl.sortKey,
      sort_dir:   tbl.sortDir,
      date_from:  tbl.dateFrom ? localDayStartUTC(tbl.dateFrom) : undefined,
      date_to:    tbl.dateTo   ? localDayEndUTC(tbl.dateTo)     : undefined,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const { items: payments, pagination, totalItems, totalPages } = tbl.unwrapPagination(serverData)

  async function handleExport() {
    try {
      const rows = await fetchAllPaymentsForExport({
        search:    tbl.debouncedSearch,
        status,
        sort_by:   tbl.sortKey,
        sort_dir:  tbl.sortDir,
        date_from: tbl.dateFrom ? localDayStartUTC(tbl.dateFrom) : undefined,
        date_to:   tbl.dateTo   ? localDayEndUTC(tbl.dateTo)     : undefined,
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

  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: (_, variables) => {
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
    payments,
    isLoading, isFetching, isError,

    ...tbl.tableProps,
    status, setStatus: handleStatus,

    totalItems, totalPages, pagination,
    handleExport,

    recordPayment:   (data, callbacks) => recordMutation.mutate(data, callbacks),
    isRecording:     recordMutation.isPending,
  }
}