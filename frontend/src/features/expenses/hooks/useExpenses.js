// NOTE (2026-07): Expenses are immutable after creation — there is no
// updateMutation / updateExpense.  The backend exposes no PUT endpoint for
// expenses.  To correct an expense, delete it and create a new one.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchExpenses,
  fetchAllExpensesForExport,
  fetchExpense,
  createExpense,
  deleteExpense,
} from '../api/expensesApi'
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils'
import { useServerTableState }              from '../../../shared/hooks/useServerTableState'
const PAGE_SIZE = 20

export function useExpense(expenseId) {
  return useQuery({
    queryKey: ['expense', expenseId],
    queryFn:  () => fetchExpense(expenseId),
    enabled:  !!expenseId,
    staleTime: 60 * 1000,
  })
}

export function useExpenses() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const tbl = useServerTableState({
    initialSortKey: 'expense_date',
    initialSortDir: 'desc',
    debounceMs:     350,
  })

  const queryKey = [
    'expenses',
    tbl.page, tbl.debouncedSearch, tbl.sortKey, tbl.sortDir, tbl.dateFrom, tbl.dateTo,
  ]

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => fetchExpenses({
      page:     tbl.page,
      limit:    PAGE_SIZE,
      search:   tbl.debouncedSearch,
      sort_by:  tbl.sortKey,
      sort_dir: tbl.sortDir,
      date_from: tbl.dateFrom ? localDayStartUTC(tbl.dateFrom) : undefined,
      date_to:   tbl.dateTo   ? localDayEndUTC(tbl.dateTo)     : undefined,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const { items: expenses, totalItems, totalPages } = tbl.unwrapPagination(serverData)

  async function handleExport() {
    try {
      const rows = await fetchAllExpensesForExport({
        search:   tbl.debouncedSearch,
        sort_by:  tbl.sortKey,
        sort_dir: tbl.sortDir,
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

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense added')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to add expense')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to delete expense')
    },
  })

  return {
    expenses,
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
    totalPages,
    totalItems,
    handleExport,
    createExpense: (data, callbacks) => createMutation.mutate(data, callbacks),
    deleteExpense: (id, callbacks) => deleteMutation.mutate(id, callbacks),
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
