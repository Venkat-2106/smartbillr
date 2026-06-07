// src/features/products/hooks/useProducts.js
//
// SCALABILITY FIX:
//
// BEFORE:
//   allQuery (limit=10000) fired on EVERY page load, loading all products into
//   browser memory even when the user was just browsing the first page.
//   Column sort and date filter ran as JavaScript useMemo on the full dataset.
//   ProductsPage owned sortKey, sortDir, dateFrom, dateTo as local state.
//
// AFTER:
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ NOT searching (isSearching = false):                                 │
//   │   pagedQuery runs with sort_by, sort_dir, updated_from, updated_to.  │
//   │   PostgreSQL does the sort + date filter + OFFSET/LIMIT.             │
//   │   Browser receives only 20 rows. allQuery does NOT run.              │
//   │                                                                      │
//   │ Searching (isSearching = true):                                      │
//   │   allQuery runs (limit=10000, no server filters).                    │
//   │   Client-side filter handles prod_name, category_name, barcode.     │
//   │   WHY client-side: backend ?search= does not match category_name    │
//   │   (it is a JOIN result, not a raw column). Barcode float-to-top UX  │
//   │   also requires client-side sort after match. Category search is a  │
//   │   real use case — user types "Electronics" to see all electronics.  │
//   │   pagedQuery does NOT run when searching.                            │
//   └──────────────────────────────────────────────────────────────────────┘
//
// SCANNER UX PRESERVED:
//   When the user types in the search box, isSearching = true, allQuery loads.
//   handleScannerEnter (in ProductsPage) uses allProducts to find exact barcode
//   match and auto-open the detail drawer — same as before.
//   allProducts is [] until allQuery resolves, but the handler guards for that.
//
// STATE MOVED INTO HOOK (was in ProductsPage local state before):
//   sortKey, sortDir, handleSort
//   dateFrom, dateTo, handleDateChange
//
// EXPORT:
//   handleExport() — when searching, returns the already-filtered client-side
//   array (category_name filter respected in CSV). When not searching, calls
//   fetchAllProductsForExport() with active sort+date filters.

import { useState }                               from 'react'
import { useQuery, useMutation, useQueryClient }  from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import {
  fetchProducts,
  fetchAllProductsForExport,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../api/productsApi'
import { useDebounce } from '../../../shared/hooks/useDebounce'

const PAGE_SIZE = 20

const KEYS = {
  all:    ['products'],
  paged:  (p, s, sk, sd, df, dt) => ['products', 'paged', p, s, sk, sd, df, dt],
  search: (s) => ['products', 'search', s],
}

export function useProducts() {
  const [page,     setPage]      = useState(1)
  const [search,   setSearchRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('prod_name')
  const [sortDir,  setSortDir]   = useState('asc')
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  const debouncedSearch = useDebounce(search, 350)
  const isSearching     = debouncedSearch.trim().length > 0

  // ── Paged query — used when NOT searching ───────────────────────────────
  // Sends sort and date params so the server does the work.
  const pagedQuery = useQuery({
    queryKey: KEYS.paged(page, '', sortKey, sortDir, dateFrom, dateTo),
    queryFn:  () => fetchProducts({
      page,
      limit:        PAGE_SIZE,
      sort_by:      sortKey,
      sort_dir:     sortDir,
      updated_from: dateFrom,
      updated_to:   dateTo,
    }),
    placeholderData: (prev) => prev,
    staleTime:       30_000,
    enabled:         !isSearching,
  })

  // ── All-records query — only loaded when the user is actively searching ──
  // Uses limit=10000 with NO server filters — client-side filter covers
  // prod_name, category_name, barcode (including USB scanner lookup).
  // NOT loaded on normal page browsing, saving a large request every load.
  const allQuery = useQuery({
    queryKey: KEYS.search(debouncedSearch),
    queryFn:  () => fetchProducts({ page: 1, limit: 10000 }),
    staleTime: 30_000,
    enabled:  isSearching,
  })

  const pagedItems = pagedQuery.data?.items  ?? []
  const allItems   = allQuery.data?.items    ?? []

  // ── Client-side filter (search path only) ──────────────────────────────
  // Runs only when isSearching = true (allQuery loaded).
  // Matches prod_name, category_name (JOIN field), barcode.
  // Also applies date range client-side when searching + date filters active.
  const q = debouncedSearch.trim().toLowerCase()

  const filteredForSearch = isSearching
    ? (() => {
        let matches = allItems.filter(p =>
          p.prod_name?.toLowerCase().includes(q)     ||
          p.category_name?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
        )

        // Apply date filter client-side when user is also searching
        if (dateFrom) {
          const from = new Date(dateFrom); from.setHours(0, 0, 0, 0)
          matches = matches.filter(r => r.updated_at && new Date(r.updated_at) >= from)
        }
        if (dateTo) {
          const to = new Date(dateTo); to.setHours(23, 59, 59, 999)
          matches = matches.filter(r => r.updated_at && new Date(r.updated_at) <= to)
        }

        // Float exact barcode match to position 0 (scanner UX)
        return matches.sort((a, b) =>
          (b.barcode?.toLowerCase() === q ? 1 : 0) -
          (a.barcode?.toLowerCase() === q ? 1 : 0)
        )
      })()
    : pagedItems   // server already applied sort + date filter

  // ── Export ──────────────────────────────────────────────────────────────
  // When searching: the filtered client-side array already respects
  // category_name and date filter — use it directly for the CSV.
  // When not searching: fetch lazily from backend with active sort+date.
  async function handleExport() {
    try {
      let rows
      if (isSearching) {
        // Already in memory, already filtered — just return it
        rows = filteredForSearch
      } else {
        rows = await fetchAllProductsForExport({
          sort_by:      sortKey,
          sort_dir:     sortDir,
          updated_from: dateFrom,
          updated_to:   dateTo,
        })
        if (pagedQuery.data?.pagination?.truncated) {
          toast('Export limited to 10,000 records. Contact support for full export.', { icon: '⚠️' })
        }
      }
      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────
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

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
    setPage(1)
  }

  const activeQuery = isSearching ? allQuery : pagedQuery

  return {
    // Table data
    products:    filteredForSearch,
    // allProducts: still exposed for the scanner handleScannerEnter in the page
    // (it needs the full list to find an exact barcode match on Enter).
    // Empty array ([]) when not searching — scanner will not auto-open drawer
    // on first scan but will work after allQuery loads (triggered by search text).
    allProducts: allItems,

    // Pagination (null when searching — no paginator shown during search)
    pagination:  isSearching ? null : (pagedQuery.data?.pagination ?? null),

    // totalItems: correct count for both modes.
    //   Not searching → server total (all pages); searching → filtered length.
    totalItems:  isSearching
      ? filteredForSearch.length
      : (pagedQuery.data?.pagination?.total ?? 0),

    // Loading / error
    isLoading:  activeQuery.isLoading,
    isError:    activeQuery.isError,

    // Search
    search,
    setSearch: handleSearch,

    // Sort (passed to Table.jsx)
    sortKey,
    sortDir,
    handleSort,

    // Date range (passed to DateRangeFilter in ProductsPage)
    dateFrom,
    dateTo,
    handleDateChange,

    // Page (passed to Pagination component)
    page,
    setPage,

    // Export
    handleExport,
  }
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product created')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not create product')
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => updateProduct(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not update product')
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Product deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not delete product')
    },
  })
}