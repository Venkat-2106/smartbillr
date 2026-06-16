import api from '../../../api/axios'

export async function fetchStaff({
  page      = 1,
  limit     = 20,
  search    = '',
  is_active = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())   params.search    = search.trim()
  if (is_active !== '') params.is_active = is_active

  const res = await api.get('/staff/', { params })
  return res.data
}

export async function fetchAllStaffForExport({
  search    = '',
  is_active = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())   params.search    = search.trim()
  if (is_active !== '') params.is_active = is_active

  const res = await api.get('/staff/', { params })
  return res.data?.items ?? []
}

export async function createStaff(payload) {
  const res = await api.post('/staff/', payload)
  return res.data
}

export async function updateStaff(staffId, payload) {
  const res = await api.patch(`/staff/${staffId}/`, payload)
  return res.data
}

export async function deactivateStaff(staffId) {
  const res = await api.delete(`/staff/${staffId}/`)
  return res.data
}
