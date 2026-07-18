import api from '../../../api/axios'

export async function fetchBusiness() {
  const res = await api.get('/businesses/me/')
  return res.data
}

export async function updateBusiness(payload) {
  const res = await api.put('/businesses/me/', payload)
  return res.data
}
