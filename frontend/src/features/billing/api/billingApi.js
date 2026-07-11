import api from '../../../api/axios'

export async function fetchPlans() {
  const res = await api.get('/billing/plans')
  return res.data
}

export async function createCheckout(planCode) {
  const res = await api.post('/billing/checkout', { plan_code: planCode })
  return res.data
}

export async function getCheckoutStatus(paymentId) {
  const res = await api.get(`/billing/checkout/${paymentId}/status`)
  return res.data
}

export async function cancelSubscription() {
  const res = await api.post('/billing/cancel')
  return res.data
}
