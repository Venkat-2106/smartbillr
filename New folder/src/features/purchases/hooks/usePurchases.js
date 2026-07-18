// src/features/purchases/hooks/usePurchases.js
// Owns ALL server state + UI filter/sort/page state for the Purchases pages.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import { useDebounce }                            from '../../../shared/hooks/useDebounce'
import { localDayStartUTC, localDayEndUTC }       from '../../../shared/utils/dateUtils'
import {
  fetchPurchases,
  fetchAllPurchasesForExport,
  fetchPurchase,
  createPurchase,
  updatePurchaseStatus,
  deletePurchase as deletePurchaseApi,
  fetchSuppliersLean,
} from '../api/purchasesApi'

const PAGE_SIZE = 20

// ── usePurchaseDetail — for the detail drawer ─────────────────────────────────
export function usePurchaseDetail(purId) {
  return useQuery({
    queryKey:  ['purchase', purId],
    queryFn:   () => fetchPurchase(purId),
    enabled:   !!purId,
    staleTime: 30_000,
  })
}

// ── useSuppliersLean — lean supplier list for create-purchase form ────────────
export function useSuppliersLean() {
  const user = useAuthStore(s => s.user)
  return useQuery({
    queryKey:  ['suppliers-lean'],
    queryFn:   fetchSuppliersLean,
    staleTime: 5 * 60 * 1000,
    enabled:   !!user,
  })
}

// ── usePurchases — list page ──────────────────────────────────────────────────
export function usePurchases() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const [search,   setSearchRaw] = useState('')
  const [status,   setStatusRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('pur_created_at')
  const [sortDir,  setSortDir]   = useState('desc')
  const [page,     setPage]      = useState(1)
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  const debouncedSearch = useDebounce(search, 350)

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['purchases', page, debouncedSearch, status, sortKey, sortDir, dateFrom, dateTo],
    queryFn:  () => fetchPurchases({
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

  const purchases  = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0
  const totalPages = pagination.total_pages ?? 1

  async function handleExport() {
    try {
      const rows = await fetchAllPurchasesForExport({
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

  function handleSearch(val) { setSearchRaw(val); setPage(1) }
  function handleStatus(val) { setStatusRaw(val); setPage(1) }

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

  // ── Status mutation ───────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ purId, status }) => updatePurchaseStatus(purId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', variables.purId] })
      toast.success('Payment status updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update status')
    },
  })

  // ── Delete mutation ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: ({ purId, reduceStock }) => deletePurchaseApi(purId, reduceStock),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', variables.purId] })
      queryClient.invalidateQueries({ queryKey: ['products-search-lean'] })
      toast.success('Purchase deleted successfully')
      if (variables.callbacks?.onSuccess) variables.callbacks.onSuccess()
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to delete purchase')
    },
  })

  // ── Create purchase mutation ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products-search-lean'] })
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to create purchase')
    },
  })

  return {
    purchases,
    isLoading,
    isFetching,
    isError,

    search,    setSearch: handleSearch,
    status,    setStatus: handleStatus,
    dateFrom,  setDateFrom: handleDateFrom,
    dateTo,    setDateTo:   handleDateTo,

    sortKey, sortDir, handleSort,
    page, setPage, totalPages, totalItems,

    handleExport,

    updateStatus:    (purId, status, callbacks) => statusMutation.mutate({ purId, status }, callbacks),
    isUpdatingStatus: statusMutation.isPending,

    deletePurchase:  (purId, reduceStock, callbacks) => deleteMutation.mutate({ purId, reduceStock, callbacks }),
    isDeleting:      deleteMutation.isPending,

    createPurchase:  (body, callbacks) => createMutation.mutate(body, callbacks),
    isCreating:      createMutation.isPending,
  }
}