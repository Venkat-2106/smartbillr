import { useQuery } from '@tanstack/react-query'
import useAuthStore from '../../../store/authStore'
import { fetchSubscription } from '../api/subscriptionApi'

export function useSubscription() {
  const token = useAuthStore(s => s.token)
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetchSubscription()
      return res.data
    },
    enabled: !!token,
    staleTime: 60 * 1000,
    retry: false,
  })
}
