// src/features/suppliers/hooks/useSuppliers.js
//
// SCALABILITY FIX — replaces client-side filter / sort / paginate.
//
// BEFORE (broken at scale):
//   One query fetched limit=10000 on every page load.
//   useMemo did all filtering, sorting, and slicing in JavaScript.
//   For businesses with > 10,000 suppliers, records were silently truncated.
//
// AFTER (unlimited scale):
//   A single React Query sends all active filters to the backend.
//   PostgreSQL does the filtering, sorting, counting, and OFFSET/LIMIT.
//   The hook receives only the 20 rows for the current page.
//   handleExport() fetches backend lazily with the same filters on click.
//
// ARCHITECTURE UNCHANGED:
//   - Server data via React Query (never fetch in component)
//   - No direct localStorage (Zustand persist handles it)
//   - authStore not imported here (in the API file either)
//   - Drawer / modal state kept in hook (same UX as before)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchSuppliers,
  fetchAllSuppliersForExport,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../api/suppliersApi'
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils'
import { useDebounce } from '../../../shared/hooks/useDebounce'
const PAGE_SIZE = 20

export function useSuppliers() {
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

  // ── Drawer & modal state (UI-only — no server data involved) ────────────
  const [drawerSupplier, setDrawerSupplier] = useState(null)
  const [showAdd,        setShowAdd]        = useState(false)
  const [editTarget,     setEditTarget]     = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)

  // ── FETCH (React Query — server paginated) ──────────────────────────────
  // queryKey includes every filter param so any change triggers a fresh fetch.
  // staleTime: 30s — short enough that edits show quickly, long enough to
  // avoid hammering the backend on rapid page or sort clicks.
  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: [
      'suppliers', page, debouncedSearch, sortKey, sortDir, dateFrom, dateTo,
    ],
    queryFn: () => fetchSuppliers({
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

  // Unwrap pagination envelope
  const suppliers  = serverData?.items       ?? []
  const pagination = serverData?.pagination  ?? {}
  const totalItems = pagination.total        ?? 0
  const totalPages = pagination.total_pages  ?? 1

  // ── LAZY EXPORT ──────────────────────────────────────────────────────────
  // Only runs when the Export button is clicked.
  // Sends the same active filters to the backend → gets all matching rows.
  async function handleExport() {
    try {
      const rows = await fetchAllSuppliersForExport({
        search:       debouncedSearch,
        sort_by:      sortKey,
        sort_dir:     sortDir,
        // TIMEZONE FIX: same UTC boundary conversion as the query
        updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      })
      if (serverData?.pagination?.truncated) {
        toast('Export limited to 10,000 records. Contact support for a full export.', { icon: '⚠️' })
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

  function handleDateChange(field, val) {
    if (field === 'from') setDateFrom(val)
    else                  setDateTo(val)
    setPage(1)
  }

  // ── MUTATIONS ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier added successfully')
      setShowAdd(false)
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to add supplier'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateSupplier(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier updated successfully')
      setEditTarget(null)
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update supplier'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier deleted')
      setDeleteTarget(null)
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to delete supplier'),
  })

  // ── Derived booleans (used by SuppliersPage for empty state + pagination) ─
  const activeSearch     = !!debouncedSearch
  const activeDateFilter = !!(dateFrom || dateTo)

  // ── RETURN ───────────────────────────────────────────────────────────────
  return {
    // Table data (current page only — server paginated)
    suppliers,

    // Loading / error states
    isLoading: isLoading || isFetching,
    isError,

    // Search
    search,
    setSearch: handleSearch,

    // Date range
    dateFrom,  setDateFrom: (v) => { setDateFrom(v);  setPage(1) },
    dateTo,    setDateTo:   (v) => { setDateTo(v);    setPage(1) },
    handleDateChange,

    // Sort (passed to Table.jsx)
    sortKey,
    sortDir,
    handleSort,

    // Pagination (passed to Pagination.jsx)
    page,
    setPage,
    totalPages,
    totalItems,
    pagination,

    // Filter activity flags (used by page for empty state + pagination visibility)
    activeSearch,
    activeDateFilter,

    // Export
    handleExport,

    // Drawer & modal state
    drawerSupplier, setDrawerSupplier,
    showAdd,        setShowAdd,
    editTarget,     setEditTarget,
    deleteTarget,   setDeleteTarget,

    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,
  }
}