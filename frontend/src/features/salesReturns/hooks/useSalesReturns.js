import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchSalesReturns,
  fetchAllSalesReturnsForExport,
  fetchSalesReturn,
  updateSalesReturnStatus,
  deleteSalesReturn,
} from '../api/salesReturnsApi'
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils'
import { useServerTableState }              from '../../../shared/hooks/useServerTableState'
const PAGE_SIZE = 20

export function useSalesReturn(returnId) {
  return useQuery({
    queryKey: ['salesReturn', returnId],
    queryFn:  () => fetchSalesReturn(returnId),
    enabled:  !!returnId,
    staleTime: 60 * 1000,
  })
}

export function useSalesReturns() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const tbl = useServerTableState({
    initialSortKey: 'return_created_at',
    initialSortDir: 'desc',
    debounceMs:     350,
  })

  const queryKey = [
    'salesReturns',
    tbl.page, tbl.debouncedSearch, tbl.sortKey, tbl.sortDir, tbl.dateFrom, tbl.dateTo,
  ]

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => fetchSalesReturns({
      page:      tbl.page,
      limit:     PAGE_SIZE,
      search:    tbl.debouncedSearch,
      sort_by:   tbl.sortKey,
      sort_dir:  tbl.sortDir,
      date_from: tbl.dateFrom ? localDayStartUTC(tbl.dateFrom) : undefined,
      date_to:   tbl.dateTo   ? localDayEndUTC(tbl.dateTo)     : undefined,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const { items: returns, pagination, totalItems, totalPages } = tbl.unwrapPagination(serverData)

  async function handleExport() {
    try {
      const rows = await fetchAllSalesReturnsForExport({
        search:    tbl.debouncedSearch,
        sort_by:   tbl.sortKey,
        sort_dir:  tbl.sortDir,
        date_from: tbl.dateFrom ? localDayStartUTC(tbl.dateFrom) : undefined,
        date_to:   tbl.dateTo   ? localDayEndUTC(tbl.dateTo)     : undefined,
      })
      if (serverData?.pagination?.truncated) {
        toast('Export limited to 10,000 records.', { icon: '\u26A0\uFE0F' })
      }
      return rows
    } catch {
      toast.error('Export failed \u2014 please try again')
      return []
    }
  }

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }) => updateSalesReturnStatus(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['salesReturns'] })
      const status = data?.data?.return?.return_status
      toast.success(`Return ${status} successfully`)
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update return')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSalesReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesReturns'] })
      toast.success('Return deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to delete return')
    },
  })

  return {
    returns,
    isLoading, isFetching, isError,
    search: tbl.search,
    setSearch: tbl.setSearch,
    dateFrom: tbl.dateFrom,
    setDateFrom: tbl.setDateFrom,
    dateTo: tbl.dateTo,
    setDateTo: tbl.setDateTo,
    sortKey: tbl.sortKey,
    sortDir: tbl.sortDir,
    handleSort: tbl.handleSort,
    page: tbl.page,
    setPage: tbl.setPage,
    totalPages, totalItems,
    handleExport,
    updateStatus: (id, payload, callbacks) => updateStatusMutation.mutate({ id, payload }, callbacks),
    deleteReturn: (id, callbacks) => deleteMutation.mutate(id, callbacks),
    isUpdatingStatus: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
