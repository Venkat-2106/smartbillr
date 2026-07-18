import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast                                      from 'react-hot-toast'
import useAuthStore                               from '../../../store/authStore'
import { fetchBusiness, updateBusiness }          from '../api/settingsApi'

export function useBusiness() {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['business'],
    queryFn:  () => fetchBusiness(),
    enabled:  !!user,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateBusiness,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['business'] })
      const business = data?.data
      if (business) {
        useAuthStore.getState().setBusiness(business)
      }
      toast.success('Settings saved')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to save settings')
    },
  })
}
