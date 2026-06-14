// src/shared/hooks/useServerTableState.js
//
// PURPOSE
// -------
// Factors out the UI-state plumbing that is byte-for-byte identical across
// every server-paginated list hook in this codebase:
//
//   useCustomers · useSuppliers · useCategories · useProducts
//   useSales · usePayments · usePurchases · useStockMovements
//
// Each of those hooks currently copy-pastes the same ~40 lines:
//   - page + setPage
//   - search raw state + useDebounce
//   - sortKey/sortDir + toggle-direction handleSort
//   - dateFrom/dateTo with page-reset handlers
//   - serverData unwrap (items/pagination/totalItems/totalPages)
//
// This hook owns ONLY that plumbing. It does NOT own useQuery, mutations,
// feature-specific filters (status, moveType, categoryId, …), or export
// logic — those stay in each feature hook because they differ per domain.
//
// USAGE (after migrating a feature hook)
// ----------------------------------------
//   const tbl = useServerTableState({
//     initialSortKey: 'updated_at',
//     initialSortDir: 'desc',
//     debounceMs:     350,          // default — omit if 350ms is fine
//   })
//
//   // Wire into useQuery:
//   const { data: serverData, isLoading, isFetching, isError } = useQuery({
//     queryKey: ['customers', tbl.page, tbl.debouncedSearch, tbl.sortKey, tbl.sortDir, tbl.dateFrom, tbl.dateTo],
//     queryFn:  () => fetchCustomers({ page: tbl.page, limit: PAGE_SIZE, search: tbl.debouncedSearch, ... }),
//     ...
//   })
//
//   // Unwrap server response:
//   const { items: customers, pagination, totalItems, totalPages } = tbl.unwrapPagination(serverData)
//
//   // Return from the feature hook (names already match useCustomers API):
//   return {
//     customers,
//     isLoading, isFetching, isError,
//     ...tbl.handlers,   // search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo,
//                        // sortKey, sortDir, handleSort, page, setPage
//     totalItems, totalPages,
//     handleExport,
//     // ...mutations
//   }
//
// API CONTRACT
// ------------
// Returned names deliberately match the field names already used by
// useCustomers.js so that migrating it is a near-zero diff.
// Do not rename these fields without updating every adopting hook.

import { useState, useCallback } from 'react'
import { useDebounce }           from './useDebounce'

// ── unwrapPagination ──────────────────────────────────────────────────────────
// Pure helper — also exported standalone so callers can import it directly
// when they don't use the full hook (e.g. a hook that only needs the unwrap).
//
// Input:  the raw `data` value from useQuery (which is success_response()'s
//         direct payload — no .data.data wrapper per project rules).
//         Shape: { items: [...], pagination: { total, total_pages, ... } }
//
// Output: { items, pagination, totalItems, totalPages }
//   items      → the row array for the current page ([] when loading)
//   pagination → the full pagination object (for Pagination.jsx)
//   totalItems → total matched records across all pages (for record count label)
//   totalPages → total page count (for Pagination.jsx guard)
export function unwrapPagination(serverData) {
  const items      = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0
  const totalPages = pagination.total_pages ?? 1
  return { items, pagination, totalItems, totalPages }
}


// ── useServerTableState ───────────────────────────────────────────────────────
//
// @param {string}  initialSortKey  Column key for the default ORDER BY.
//                                  Required — forces the caller to be explicit.
// @param {string}  [initialSortDir='desc']  'asc' | 'desc'
// @param {number}  [debounceMs=350]  Delay after last keystroke before the
//                                    debounced search value updates.
//                                    Use 350 for all new hooks (matches
//                                    customers/payments/stock). useSales uses
//                                    300 — override when migrating it.
//
// @returns {object}  See "RETURN SHAPE" section below.
export function useServerTableState({
  initialSortKey,
  initialSortDir = 'desc',
  debounceMs     = 350,
} = {}) {

  // ── Page ─────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)

  // ── Search ───────────────────────────────────────────────────────────────
  // `search`          → raw value bound to the SearchBar input (updates on every keystroke)
  // `debouncedSearch` → delayed value included in queryKey / sent to the API
  //
  // Both are returned so the feature hook can:
  //   - pass `search` to SearchBar's value prop (immediate visual feedback)
  //   - include `debouncedSearch` in queryKey (prevents a fetch on every keystroke)
  const [search, setSearchRaw] = useState('')
  const debouncedSearch        = useDebounce(search, debounceMs)

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState(initialSortKey)
  const [sortDir, setSortDir] = useState(initialSortDir)

  // ── Date range ───────────────────────────────────────────────────────────
  // Raw 'YYYY-MM-DD' strings from <input type="date">.
  // The feature hook is responsible for converting these to UTC ISO boundaries
  // via localDayStartUTC / localDayEndUTC before passing to the API, because
  // the param names differ per endpoint (updated_from vs date_from vs …).
  const [dateFrom, setDateFromRaw] = useState('')
  const [dateTo,   setDateToRaw]   = useState('')


  // ── Handlers ─────────────────────────────────────────────────────────────
  // All handlers reset page to 1 — any filter change means the current page
  // number is no longer valid against the new result set.

  const handleSearch = useCallback((val) => {
    setSearchRaw(val)
    setPage(1)
  }, [])

  // handleSort: clicking the same column header toggles direction; clicking
  // a different column switches to it and resets direction to 'asc'.
  // This is the verbatim toggle logic copied from all four source hooks.
  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }, [sortKey])

  const handleDateFrom = useCallback((val) => {
    setDateFromRaw(val)
    setPage(1)
  }, [])

  const handleDateTo = useCallback((val) => {
    setDateToRaw(val)
    setPage(1)
  }, [])


  // ── RETURN SHAPE ─────────────────────────────────────────────────────────
  // Names match useCustomers.js exactly (the first planned adopter).
  // Feature hooks spread or destructure these into their own return object.
  //
  // Raw state values (for queryKey + queryFn params):
  //   page, search, debouncedSearch, sortKey, sortDir, dateFrom, dateTo
  //
  // Stable handlers (for JSX event props):
  //   setPage        — passed to <Pagination onPageChange={setPage} />
  //   setSearch      — passed to <SearchBar onChange={setSearch} />
  //   handleSort     — passed to <Table onSort={handleSort} />
  //   setDateFrom    — passed to <DateRangeFilter onChange={(f,v) => ...} />
  //   setDateTo      — same
  //
  // Utility:
  //   unwrapPagination(serverData) — call with useQuery's `data` to get
  //                                  { items, pagination, totalItems, totalPages }
  return {
    // ── Raw state (include in queryKey) ────────────────────────────────────
    page,
    search,
    debouncedSearch,
    sortKey,
    sortDir,
    dateFrom,
    dateTo,

    // ── Stable handlers ─────────────────────────────────────────────────────
    setPage,                    // direct setter — stable, no page-reset needed
    setSearch:   handleSearch,  // resets page
    handleSort,                 // resets page
    setDateFrom: handleDateFrom, // resets page
    setDateTo:   handleDateTo,   // resets page

    // ── Pagination unwrap utility ───────────────────────────────────────────
    // Pass the raw useQuery `data` value; get back the four values every
    // list hook currently derives identically from serverData.
    unwrapPagination,

    // ── Convenience spread alias ────────────────────────────────────────────
    // Feature hooks can spread `tbl.tableProps` directly into their return
    // to expose all the Table + Pagination + SearchBar + DateRangeFilter
    // props in one shot, then add/override domain-specific names alongside it.
    //
    //   return { ...tbl.tableProps, customers, totalItems, totalPages, ... }
    //
    // This alias is purely additive — callers that prefer explicit
    // destructuring can ignore it.
    tableProps: {
      page,
      setPage,
      search,
      setSearch:   handleSearch,
      sortKey,
      sortDir,
      handleSort,
      dateFrom,
      setDateFrom: handleDateFrom,
      dateTo,
      setDateTo:   handleDateTo,
    },
  }
}