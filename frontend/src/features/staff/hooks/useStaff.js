import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }                               from 'react'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import {
  fetchStaff,
  fetchAllStaffForExport,
  fetchStaffSummary,
  createStaff,
  updateStaff,
  deactivateStaff,
} from '../api/staffApi'
import { useDebounce } from '../../../shared/hooks/useDebounce'
const PAGE_SIZE = 20

export function useStaff() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearchRaw] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const debouncedSearch = useDebounce(search, 350)

  function handleSearch(val) {
    setSearchRaw(val)
    setPage(1)
  }

  const {
    data:      serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['staff', page, debouncedSearch, activeFilter],
    queryFn: () => fetchStaff({
      page,
      limit:     PAGE_SIZE,
      search:    debouncedSearch,
      is_active: activeFilter,
    }),
    staleTime:       30_000,
    placeholderData: (prev) => prev,
    enabled:         !!user,
  })

  const { data: summary } = useQuery({
    queryKey: ['staff-summary'],
    queryFn: fetchStaffSummary,
    staleTime: 60_000,
    enabled: !!user,
  })

  const staffLimit   = summary?.limits?.staff
  const managerLimit = summary?.limits?.manager

  const canAddStaff = staffLimit === null
    || (staffLimit > 0 && (summary?.staff_count ?? 0) < staffLimit)

  const canAddManager = managerLimit === null
    || (managerLimit > 0 && (summary?.manager_count ?? 0) < managerLimit)

  const canAddAnyRole = canAddStaff || canAddManager

  const items      = serverData?.items      ?? []
  const pagination = serverData?.pagination ?? {}
  const totalItems = pagination.total       ?? 0
  const totalPages = pagination.total_pages ?? 1

  async function handleExport() {
    try {
      return await fetchAllStaffForExport({
        search:    debouncedSearch,
        is_active: activeFilter,
      })
    } catch {
      toast.error('Export failed \u2014 please try again')
      return []
    }
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['staff'] })
    queryClient.invalidateQueries({ queryKey: ['staff-summary'] })
  }

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      invalidateAll()
      toast.success('Staff member added')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to add staff')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStaff(id, payload),
    onSuccess: () => {
      invalidateAll()
      toast.success('Staff member updated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update staff')
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: deactivateStaff,
    onSuccess: () => {
      invalidateAll()
      toast.success('Staff account deactivated')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to deactivate staff')
    },
  })

  return {
    staffList: items,
    isLoading, isFetching, isError,
    search, setSearch: handleSearch,
    activeFilter, setActiveFilter: (v) => { setActiveFilter(v); setPage(1) },
    page, setPage,
    totalItems, totalPages,
    handleExport,
    createStaff: (data, callbacks) => createMutation.mutate(data, callbacks),
    updateStaff: (id, payload, callbacks) => updateMutation.mutate({ id, payload }, callbacks),
    deactivateStaff: (id, callbacks) => deactivateMutation.mutate(id, callbacks),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
    summary,
    canAddStaff,
    canAddManager,
    canAddAnyRole,
  }
}
