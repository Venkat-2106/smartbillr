import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCheckout, getCheckoutStatus, fetchPlans, cancelSubscription } from '../api/billingApi'

export function usePlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: fetchPlans,
    staleTime: 10 * 60 * 1000,
  })
}

export function useCheckout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planCode, billingCycle }) => createCheckout(planCode, billingCycle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

export function useCheckoutStatus(paymentId, enabled = true) {
  return useQuery({
    queryKey: ['checkout-status', paymentId],
    queryFn: () => getCheckoutStatus(paymentId),
    refetchInterval: (data) => data?.status === 'paid' || data?.status === 'failed' ? false : 1500,
    enabled: enabled && !!paymentId,
  })
}

export function useCancelSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}
