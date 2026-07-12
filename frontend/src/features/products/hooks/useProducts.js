// src/features/products/hooks/useProducts.js
//
// SCALABILITY FIX (v2):
//
// BEFORE (v1):
//   When searching, allQuery (limit=10000, no server filters) fetched the
//   entire product catalogue into the browser and filtered client-side on
//   prod_name, category_name, and barcode. This was needed because the
//   backend's ?search= param only matched prod_name and barcode — not
//   category_name (a JOIN field).
//
// AFTER (v2):
//   The backend GET /products endpoint now matches category_name as well:
//     p.prod_name ILIKE :search OR p.barcode ILIKE :search OR c.category_name ILIKE :search
//   So a single paginated query (pagedQuery) covers ALL cases — searching or
//   not. PostgreSQL does search + sort + date filter + pagination. The
//   browser always receives at most PAGE_SIZE rows. allQuery and the
//   limit=10000 fetch are removed entirely.
//
// SCANNER UX:
//   handleScannerEnter (in ProductsPage) previously used allProducts
//   (the full 10000-row dataset) to find an exact barcode match on Enter.
//   That full dataset no longer exists. ProductsPage now calls
//   fetchProductByBarcode() directly (the same lean, indexed endpoint used
//   by CreateSalePage's scanner) on Enter. The hook no longer exposes
//   allProducts.

import { useState, useCallback }                  from 'react'
import { useQuery, useMutation, useQueryClient }  from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import {
  fetchProducts,
  fetchAllProductsForExport,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../api/productsApi'
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils'
import { useDebounce } from '../../../shared/hooks/useDebounce'
const PAGE_SIZE = 20

const KEYS = {
  all:   ['products'],
  paged: (p, s, sk, sd, df, dt) => ['products', 'paged', p, s, sk, sd, df, dt],
}

export function useProducts() {
  const [page,     setPage]      = useState(1)
  const [search,   setSearchRaw] = useState('')
  const [sortKey,  setSortKey]   = useState('prod_name')
  const [sortDir,  setSortDir]   = useState('asc')
  const [dateFrom, setDateFrom]  = useState('')
  const [dateTo,   setDateTo]    = useState('')

  const debouncedSearch = useDebounce(search, 350)

  // ── Single paginated query — server handles search + sort + date filter ──
  // category_name is now matched server-side (backend JOIN + ILIKE), so this
  // one query covers both the "browsing" and "searching" cases. No second
  // large fetch is needed.
  const pagedQuery = useQuery({
    queryKey: KEYS.paged(page, debouncedSearch, sortKey, sortDir, dateFrom, dateTo),
    queryFn:  () => fetchProducts({
      page,
      limit:        PAGE_SIZE,
      search:       debouncedSearch,
      sort_by:      sortKey,
      sort_dir:     sortDir,
      // TIMEZONE FIX: send UTC ISO boundaries of the user's local day
      updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
      updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
    }),
    placeholderData: (prev) => prev,
    staleTime:       30_000,
  })

  const products = pagedQuery.data?.items ?? []

  // ── Export ──────────────────────────────────────────────────────────────
  // Lazily fetches ALL matching rows (limit=10000) with the same active
  // search/sort/date filters — only called on export click.
  const handleExport = useCallback(async () => {
    try {
      const rows = await fetchAllProductsForExport({
        search:       debouncedSearch,
        sort_by:      sortKey,
        sort_dir:     sortDir,
        updated_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        updated_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      })
      if (pagedQuery.data?.pagination?.truncated) {
        toast('Export limited to 10,000 records. Contact support for full export.', { icon: '⚠️' })
      }
      return rows
    } catch {
      toast.error('Export failed — please try again')
      return []
    }
  }, [debouncedSearch, sortKey, sortDir, dateFrom, dateTo, pagedQuery.data])

  // ── Event handlers ──────────────────────────────────────────────────────
  const handleSearch = useCallback((val) => {
    setSearchRaw(val)
    setPage(1)
  }, [])

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }, [sortKey])

  const handleDateChange = useCallback((field, value) => {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
    setPage(1)
  }, [])

  return {
    // Table data
    products,

    // Pagination — always shown now (server-paginated for all cases)
    pagination: pagedQuery.data?.pagination ?? null,

    // totalItems: server total across all pages of the current filter set
    totalItems: pagedQuery.data?.pagination?.total ?? 0,

    // Loading / error
    isLoading:  pagedQuery.isLoading,
    isError:    pagedQuery.isError,

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