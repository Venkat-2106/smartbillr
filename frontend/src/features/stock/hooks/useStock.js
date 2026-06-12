// src/features/stock/hooks/useStock.js
//
// Owns ALL server state + filter/sort/page UI state for the Stock page.
// Mirrors features/purchases/hooks/usePurchases.js pattern:
//   queryKey includes [feature, page, debouncedSearch, ...filters, sortKey, sortDir]
//   staleTime: 30_000, placeholderData: (prev) => prev, enabled: !!user

import { useQuery }                         from '@tanstack/react-query'
import { useState }                         from 'react'
import toast                                from 'react-hot-toast'
import useAuthStore                         from '../../../store/authStore'
import { useDebounce }                      from '../../../shared/hooks/useDebounce'
import { fetchStock, fetchAllStockForExport } from '../api/stockApi'

const PAGE_SIZE = 20

export function useStock() {
  const user = useAuthStore(s => s.user)

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

  function handleSearch(val)     { setSearchRaw(val);     setPage(1) }
  function handleCategory(val)   { setCategoryIdRaw(val); setPage(1) }
  function handleStatus(val)     { setStatusRaw(val);     setPage(1) }
  function handleIsActive(val)   { setIsActiveRaw(val);   setPage(1) }

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
    isLoading: isLoading || isFetching,
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