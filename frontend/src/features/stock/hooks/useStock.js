// src/features/stock/hooks/useStock.js
//
// Three exported hooks — one per tab, lazy-loaded so each tab's data is only
// fetched when that tab is first opened (React Query + enabled: !!user).
//
//   useStock()          → Current Stock tab  (existing, unchanged)
//   useStockMovements() → Stock Movements tab (new)
//   useStockAlerts()    → Low Stock Alerts tab (new)
//
// Adjust Stock mutation lives here too (useStockAdjust) and is called from
// AdjustStockModal — it invalidates both stock + movements on success.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import { useDebounce }                            from '../../../shared/hooks/useDebounce'
import { localDayStartUTC, localDayEndUTC }       from '../../../shared/utils/dateUtils'
import {
  fetchStock,
  fetchAllStockForExport,
  fetchMovements,
  fetchAllMovementsForExport,
  fetchAlerts,
  adjustStock,
  markAlertRead,
} from '../api/stockApi'

const PAGE_SIZE = 20

// ── useStock — Current Stock tab ──────────────────────────────────────────────
export function useStock() {
  const user        = useAuthStore(s => s.user)

  const [search,     setSearchRaw]     = useState('')
  const [categoryId, setCategoryIdRaw] = useState('')
  const [status,     setStatusRaw]     = useState('')
  const [isActive,   setIsActiveRaw]   = useState('')
  const [sortKey,    setSortKey]       = useState('prod_name')
  const [sortDir,    setSortDir]       = useState('asc')
  const [page,       setPage]          = useState(1)

  const debouncedSearch = useDebounce(search, 350)

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['stock', page, debouncedSearch, categoryId, status, isActive, sortKey, sortDir],
    queryFn:  () => fetchStock({
      page,
      limit:       PAGE_SIZE,
      search:      debouncedSearch,
      category_id: categoryId,
      status,
      is_active:   isActive,
      sort_by:     sortKey,
      sort_dir:    sortDir,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const stock       = serverData?.items      ?? []
  const pagination  = serverData?.pagination ?? {}
  const totalItems  = pagination.total       ?? 0

  async function handleExport() {
    try {
      const rows = await fetchAllStockForExport({
        search:      debouncedSearch,
        category_id: categoryId,
        status,
        is_active:   isActive,
        sort_by:     sortKey,
        sort_dir:    sortDir,
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

  function handleSearch(val)   { setSearchRaw(val);     setPage(1) }
  function handleCategory(val) { setCategoryIdRaw(val); setPage(1) }
  function handleStatus(val)   { setStatusRaw(val);     setPage(1) }
  function handleIsActive(val) { setIsActiveRaw(val);   setPage(1) }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return {
    stock,
    pagination,
    totalItems,
    isLoading,
    isFetching,
    isError,

    search,     setSearch:     handleSearch,
    categoryId, setCategoryId: handleCategory,
    status,     setStatus:     handleStatus,
    isActive,   setIsActive:   handleIsActive,

    sortKey, sortDir, handleSort,
    page, setPage,

    handleExport,
  }
}

// ── useStockAdjust — mutation for the Adjust Stock modal ─────────────────────
// Invalidates stock list + movements so both tabs refresh after an adjustment.
export function useStockAdjust() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: (data) => {
      // Invalidate current stock list (all pages/filters)
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      // Invalidate movements so new adjustment row appears
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      // Invalidate alerts — stock change may resolve or create a low-stock alert
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] })
      // Invalidate dashboard summar count
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(
        data?.message ?? 'Stock adjusted successfully'
      )
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Stock adjustment failed')
    },
  })

  return {
    doAdjust:    (payload, callbacks) => mutation.mutate(payload, callbacks),
    isAdjusting: mutation.isPending,
  }
}

// ── useStockAlertRead — mark a single alert as read ──────────────────────────
// Also invalidates the dashboard alert count so the badge stays in sync.
export function useStockAlertRead() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: markAlertRead,
    onSuccess:  () => {
      // Invalidate both the alerts list and the dashboard summary so the
      // unread count stays accurate after the user views an alert.
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to mark alert as read')
    },
  })

  return {
    markRead:    (alertId, callbacks) => mutation.mutate(alertId, callbacks),
    isMarkingRead: mutation.isPending,
  }
}

// ── useStockMovements — Stock Movements tab ───────────────────────────────────
// Only enabled when the Movements tab is active (pass active prop from page).
// dateFrom defaults to 30 days ago, dateTo to today — avoids unbounded full-table
// scans on initial load. User can still clear or widen the range via the pickers.
export function useStockMovements({ active = false } = {}) {
  const user = useAuthStore(s => s.user)

  const [search,   setSearchRaw]  = useState('')
  const [moveType, setMoveTypeRaw] = useState('')
  const defaultDateFrom = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })()
  const defaultDateTo = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })()
  const [dateFrom, setDateFrom]   = useState(defaultDateFrom)
  const [dateTo,   setDateTo]     = useState(defaultDateTo)
  const [sortKey,  setSortKey]    = useState('move_created_at')
  const [sortDir,  setSortDir]    = useState('desc')
  const [page,     setPage]       = useState(1)

  const debouncedSearch = useDebounce(search, 350)

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['stock-movements', page, debouncedSearch, moveType, dateFrom, dateTo, sortKey, sortDir],
    queryFn:  () => fetchMovements({
      page,
      limit:     PAGE_SIZE,
      search:    debouncedSearch,
      move_type: moveType,
      date_from: dateFrom ? localDayStartUTC(dateFrom) : '',
      date_to:   dateTo   ? localDayEndUTC(dateTo)     : '',
      sort_by:   sortKey,
      sort_dir:  sortDir,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    // Only fetch when tab is open AND user is logged in
    enabled:         !!user && active,
  })

  const movements  = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0

  async function handleExport() {
    try {
      const rows = await fetchAllMovementsForExport({
        search:    debouncedSearch,
        move_type: moveType,
        date_from: dateFrom ? localDayStartUTC(dateFrom) : '',
        date_to:   dateTo   ? localDayEndUTC(dateTo)     : '',
        sort_by:   sortKey,
        sort_dir:  sortDir,
      })
      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }

  function handleSearch(val)   { setSearchRaw(val);    setPage(1) }
  function handleMoveType(val) { setMoveTypeRaw(val);  setPage(1) }
  function handleDateFrom(val) { setDateFrom(val);     setPage(1) }
  function handleDateTo(val)   { setDateTo(val);       setPage(1) }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return {
    movements,
    pagination,
    totalItems,
    isLoading,
    isFetching,
    isError,

    search,   setSearch:   handleSearch,
    moveType, setMoveType: handleMoveType,
    dateFrom, setDateFrom: handleDateFrom,
    dateTo,   setDateTo:   handleDateTo,

    sortKey, sortDir, handleSort,
    page, setPage,

    handleExport,
  }
}

// ── useStockAlerts — Low Stock Alerts tab ─────────────────────────────────────
// Only enabled when Alerts tab is active (pass active prop from page).
// Backend /stock/alerts does not support search or sort — pagination only.
export function useStockAlerts({ active = false } = {}) {
  const user = useAuthStore(s => s.user)
  const [page, setPage] = useState(1)

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['stock-alerts', page],
    queryFn:  () => fetchAlerts({ page, limit: PAGE_SIZE }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user && active,
  })

  const alerts     = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0

  return {
    alerts,
    pagination,
    totalItems,
    isLoading,
    isFetching,
    isError,
    page, setPage,
    refetch,
  }
}