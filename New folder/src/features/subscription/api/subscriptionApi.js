import api from '../../../api/axios'

export async function fetchSubscription() {
  const res = await api.get('/businesses/me/subscription')
  return res.data
}

export async function registerBusiness(payload) {
  const res = await api.post('/business', payload)
  return res.data
}
