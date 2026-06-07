// src/features/categories/hooks/useCategories.js
//
// SCALABILITY FIX — replaced dual-query client-side pattern with a single
// server-side query (mirrors useCustomers.js exactly).
//
// BEFORE:
//   pagedQuery  — fetched current page (limit=20)
//   allQuery    — fetched limit=100 for search
//   Client-side: search → filter on allQuery items
//   Problem: > 100 categories = silently truncated search results
//   Problem: date filter applied in CategoriesPage useMemo (client-side)
//   Problem: column sort applied in CategoriesPage useMemo (client-side)
//
// AFTER:
//   Single query sends every active filter (search, sort, date range, page)
//   to the backend as query params. PostgreSQL does all the work.
//   The hook owns all filter state — no state in the page component.
//   handleExport() fetches lazily with the same filters on click.
//
// STATE MOVED INTO HOOK (was in CategoriesPage local state):
//   sortKey, sortDir, handleSort
//   dateFrom, dateTo, handleDateChange

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchCategories,
  fetchAllCategoriesForExport,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categoriesApi'
import { useDebounce } from '../../../shared/hooks/useDebounce'

// ── Timezone-aware date boundary helpers ─────────────────────────────────────
// Mirrors the pattern in useSales.js. Converts a local "YYYY-MM-DD" calendar
// date into UTC ISO strings representing the actual start and end of that local
// day. The backend compares these directly against the timestamptz column.
function localDayStartUTC(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function localDayEndUTC(dateStr) {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const PAGE_SIZE = 20

export function useCategories() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  // ── Filter / sort / page state ──────────────────────────────────────────
  const [search,   setSearchRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('category_name')
  const [sortDir,  setSortDir]   = useState('asc')
  const [page,     setPage]      = useState(1)
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  // Debounce: wait 350ms after the user stops typing before sending to server
  const debouncedSearch = useDebounce(search, 350)

  // ── FETCH (React Query — server paginated) ──────────────────────────────
  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: [
      'categories', page, debouncedSearch, sortKey, sortDir, dateFrom, dateTo,
    ],
    queryFn: () => fetchCategories({
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
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  // Unwrap pagination envelope
  const categories = serverData?.items       ?? []
  const pagination = serverData?.pagination  ?? null
  const totalItems = pagination?.total       ?? 0

  // ── LAZY EXPORT ──────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const rows = await fetchAllCategoriesForExport({
        search:       debouncedSearch,
        sort_by:      sortKey,
        sort_dir:     sortDir,
        // TIMEZONE FIX: same UTC boundary conversion as the query
        updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
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
  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Category created')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create category')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Category updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update category')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      const n = data?.products_deactivated ?? 0
      if (n > 0) {
        toast.success(`Category deleted · ${n} product${n > 1 ? 's' : ''} also deactivated`)
      } else {
        toast.success('Category deleted')
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete category')
    },
  })

  // ── RETURN ───────────────────────────────────────────────────────────────
  return {
    // Table data (current page only — server paginated + filtered + sorted)
    categories,

    // Loading / error states
    isLoading: isLoading || isFetching,
    isError,

    // Search
    search,
    setSearch: handleSearch,

    // Sort (passed to Table.jsx)
    sortKey,
    sortDir,
    handleSort,

    // Date range
    dateFrom,
    dateTo,
    handleDateChange,

    // Pagination
    page,
    setPage,
    pagination,
    totalItems,

    // Export
    handleExport,

    // Mutations (named exports so page can call them and get isPending)
    createCategory: (data, callbacks)     => createMut.mutate(data, callbacks),
    updateCategory: ({ id, payload }, cb) => updateMut.mutate({ id, payload }, cb),
    deleteCategory: (id, callbacks)       => deleteMut.mutate(id, callbacks),
    isCreating: createMut.isPending,
    isUpdating: updateMut.isPending,
    isDeleting: deleteMut.isPending,
  }
}

// ── Re-exported aliases kept for backward compat with any other import sites ──
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Category created')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create category')
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Category updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update category')
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      const n = data?.products_deactivated ?? 0
      if (n > 0) {
        toast.success(`Category deleted · ${n} product${n > 1 ? 's' : ''} also deactivated`)
      } else {
        toast.success('Category deleted')
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete category')
    },
  })
}