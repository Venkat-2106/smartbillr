import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCheckout, getCheckoutStatus, fetchPlans, cancelSubscription, changePlan } from '../api/billingApi'

export function usePlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
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

const MAX_POLLS = 40
const POLL_INTERVAL = 1500

// FIX (2026-08-03): previously this polled every 1.5s forever. Cap it at
// ~40 polls (~60s) so a stuck payment doesn't hammer the backend indefinitely;
// BillingSuccessPage shows a terminal "taking longer than usual" state once
// hasTimedOut flips true.
export function useCheckoutStatus(paymentId, enabled = true) {
  const query = useQuery({
    queryKey: ['checkout-status', paymentId],
    queryFn: () => getCheckoutStatus(paymentId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'paid' || status === 'failed') return false
      if (query.state.dataUpdateCount >= MAX_POLLS) return false
      return POLL_INTERVAL
    },
    enabled: enabled && !!paymentId,
  })
  const status = query.data?.status
  const hasTimedOut =
    query.isSuccess &&
    query.dataUpdateCount >= MAX_POLLS &&
    status !== 'paid' &&
    status !== 'failed'
  return { ...query, hasTimedOut }
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

export function useChangePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planCode, billingCycle }) => changePlan(planCode, billingCycle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}
