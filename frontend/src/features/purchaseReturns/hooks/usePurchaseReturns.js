import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchPurchaseReturns,
  fetchAllPurchaseReturnsForExport,
  fetchPurchaseReturn,
  createPurchaseReturn,
  updatePurchaseReturnStatus,
  deletePurchaseReturn,
} from '../api/purchaseReturnsApi'
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils'
import { useServerTableState }              from '../../../shared/hooks/useServerTableState'
const PAGE_SIZE = 20

export function usePurchaseReturn(returnId) {
  return useQuery({
    queryKey: ['purchaseReturn', returnId],
    queryFn:  () => fetchPurchaseReturn(returnId),
    enabled:  !!returnId,
    staleTime: 60 * 1000,
  })
}

export function usePurchaseReturns() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const tbl = useServerTableState({
    initialSortKey: 'return_created_at',
    initialSortDir: 'desc',
    debounceMs:     350,
  })

  const queryKey = [
    'purchaseReturns',
    tbl.page, tbl.debouncedSearch, tbl.sortKey, tbl.sortDir, tbl.dateFrom, tbl.dateTo,
  ]

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => fetchPurchaseReturns({
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
      const rows = await fetchAllPurchaseReturnsForExport({
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
    mutationFn: ({ id, payload }) => updatePurchaseReturnStatus(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseReturns'] })
      const status = data?.data?.return?.return_status
      toast.success(`Return ${status} successfully`)
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update return')
    },
  })

  const createMutation = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseReturns'] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      toast.success('Return created successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to create return')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseReturns'] })
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
    createReturn: (payload, callbacks) => createMutation.mutate(payload, callbacks),
    isCreating: createMutation.isPending,
    updateStatus: (id, payload, callbacks) => updateStatusMutation.mutate({ id, payload }, callbacks),
    deleteReturn: (id, callbacks) => deleteMutation.mutate(id, callbacks),
    isUpdatingStatus: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
